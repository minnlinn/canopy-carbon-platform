-- Explicit SME business-contact sharing for the referring Partner. Apply after migrations 016, 018, 020 and 021.
begin;

do $$
begin
  if to_regclass('public.canopy_partner_profile_consents') is null
     or to_regclass('public.canopy_partner_referrals') is null
     or to_regprocedure('public.canopy_partner_referred_smes()') is null
     or to_regprocedure('public.canopy_effective_account_status(uuid)') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_has_subscription_for(uuid,text)') is null then
    raise exception 'Apply Canopy migrations 016, 018, 020 and 021 before this migration.';
  end if;
end;
$$;

create table if not exists public.canopy_partner_contact_consents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  sme_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz,
  revoked_at timestamptz,
  unique(partner_id,sme_id)
);
alter table public.canopy_partner_contact_consents enable row level security;
drop policy if exists canopy_partner_contact_consents_read on public.canopy_partner_contact_consents;
create policy canopy_partner_contact_consents_read on public.canopy_partner_contact_consents for select to authenticated
  using (sme_id=auth.uid() or public.canopy_is_admin());
revoke all on public.canopy_partner_contact_consents from anon, authenticated;
grant select on public.canopy_partner_contact_consents to authenticated;

-- Removing Business Profile sharing also removes the dependent contact consent,
-- so a later profile re-grant cannot silently restore contact disclosure.
create or replace function public.canopy_revoke_partner_contact_consent_with_profile()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.revoked_at is not null then
    update public.canopy_partner_contact_consents
      set revoked_at=coalesce(revoked_at,new.revoked_at)
      where partner_id=new.partner_id and sme_id=new.sme_id and revoked_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists canopy_revoke_partner_contact_consent_with_profile on public.canopy_partner_profile_consents;
create trigger canopy_revoke_partner_contact_consent_with_profile
after update of revoked_at on public.canopy_partner_profile_consents
for each row when (new.revoked_at is not null)
execute function public.canopy_revoke_partner_contact_consent_with_profile();

create or replace function public.canopy_set_partner_contact_consent(p_partner_id uuid,p_granted boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.canopy_partner_contact_consents;
begin
  if p_partner_id is null or p_granted is null then
    raise exception 'Partner and consent choice are required.' using errcode='22023';
  end if;
  if auth.uid() is null
     or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='sme')
     or public.canopy_effective_account_status(auth.uid()) is distinct from 'verified'
     or public.canopy_is_account_active(auth.uid()) is not true then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  if not exists(select 1 from public.canopy_partner_referrals r where r.sme_id=auth.uid() and r.partner_id=p_partner_id) then
    raise exception 'Contact sharing is available only to your referring Partner.' using errcode='42501';
  end if;
  if p_granted and (
    not exists(select 1 from public.canopy_partner_profile_consents c where c.partner_id=p_partner_id and c.sme_id=auth.uid() and c.granted_at is not null and c.revoked_at is null)
    or public.canopy_effective_account_status(p_partner_id) is distinct from 'verified'
    or public.canopy_is_account_active(p_partner_id) is not true
    or public.canopy_has_subscription_for(p_partner_id,'partner') is not true
  ) then
    raise exception 'Business Profile sharing and an active Partner subscription are required before sharing contact details.' using errcode='42501';
  end if;
  if p_granted then
    insert into public.canopy_partner_contact_consents(partner_id,sme_id,granted_at,revoked_at)
    values(p_partner_id,auth.uid(),now(),null)
    on conflict(partner_id,sme_id) do update set granted_at=excluded.granted_at, revoked_at=null
    returning * into result;
  else
    update public.canopy_partner_contact_consents set revoked_at=coalesce(revoked_at,now())
      where partner_id=p_partner_id and sme_id=auth.uid()
      returning * into result;
    if not found then raise exception 'No business-contact consent exists to revoke.' using errcode='P0002'; end if;
  end if;
  return to_jsonb(result);
end;
$$;

-- The Partner can retrieve an SME contact field only through this profile RPC,
-- which requires the linked SME's active profile and contact consents on every call.
create or replace function public.canopy_partner_referred_sme_profile(p_sme_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare contacts_shared boolean;
begin
  if p_sme_id is null or not exists(select 1 from public.canopy_partner_referred_smes() r where r.sme_id=p_sme_id and r.profile_shared) then
    raise exception 'SME business profile has not been shared.' using errcode='42501';
  end if;
  select exists(
    select 1 from public.canopy_partner_contact_consents c
    join public.canopy_partner_profile_consents pc on pc.partner_id=c.partner_id and pc.sme_id=c.sme_id
    join public.canopy_partner_referrals r on r.partner_id=c.partner_id and r.sme_id=c.sme_id
    where c.partner_id=auth.uid() and c.sme_id=p_sme_id
      and r.partner_id=auth.uid()
      and c.granted_at is not null and c.revoked_at is null
      and pc.granted_at is not null and pc.revoked_at is null
  ) into contacts_shared;
  return (select jsonb_build_object(
    'company_name',p.company_name,
    'sector',p.sector,
    'verification_status',public.canopy_effective_account_status(p.id),
    'company_description',p.company_description,
    'contacts_shared',contacts_shared,
    'contact_name',case when contacts_shared then p.contact_name else null end,
    'contact_email',case when contacts_shared then p.contact_email else null end,
    'business_phone',case when contacts_shared then p.business_phone else null end,
    'website',case when contacts_shared then p.website else null end,
    'business_address',case when contacts_shared then p.business_address else null end
  ) from public.profiles p where p.id=p_sme_id);
end;
$$;

create or replace function public.canopy_sme_partner_access()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or public.canopy_is_account_active(actor) is not true
     or not exists(select 1 from public.profiles where id=actor and role::text='sme') then
    raise exception 'An active SME account is required.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'partner_id',r.partner_id,'partner_name',p.company_name,'contact_visible',p.partner_contact_visible,
    'contact_name',case when p.partner_contact_visible then p.contact_name else null end,
    'contact_email',case when p.partner_contact_visible then p.contact_email else null end,
    'business_phone',case when p.partner_contact_visible then p.business_phone else null end,
    'website',case when p.partner_contact_visible then p.website else null end,
    'company_description',case when p.partner_contact_visible then p.company_description else null end,
    'referral_code',r.code,
    'profile_granted',(pc.granted_at is not null and pc.revoked_at is null),
    'contact_granted',(ct.granted_at is not null and ct.revoked_at is null),
    'full_granted',(cc.granted_at is not null and cc.revoked_at is null)
  ) order by r.created_at desc)
  from public.canopy_partner_referrals r
  join public.profiles p on p.id=r.partner_id
  left join public.canopy_partner_profile_consents pc on pc.partner_id=r.partner_id and pc.sme_id=actor
  left join public.canopy_partner_contact_consents ct on ct.partner_id=r.partner_id and ct.sme_id=actor
  left join public.canopy_partner_client_consents cc on cc.partner_id=r.partner_id and cc.sme_id=actor
  where r.sme_id=actor and p.role::text='partner'
    and public.canopy_effective_account_status(p.id)='verified'
    and public.canopy_is_account_active(p.id) is true
    and public.canopy_has_subscription_for(p.id,'partner') is true
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.canopy_set_partner_contact_consent(uuid,boolean),public.canopy_partner_referred_sme_profile(uuid),public.canopy_sme_partner_access() from public, anon;
grant execute on function public.canopy_set_partner_contact_consent(uuid,boolean),public.canopy_partner_referred_sme_profile(uuid),public.canopy_sme_partner_access() to authenticated;
commit;
