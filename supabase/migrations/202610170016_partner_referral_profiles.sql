-- Referral capture and profile-only sharing. Run after migrations 001–015.
begin;

do $$ begin
  if to_regclass('public.canopy_partner_referrals') is null
     or to_regclass('public.canopy_partner_codes') is null
     or to_regclass('public.canopy_account_access_controls') is null
     or to_regprocedure('public.canopy_effective_account_status(uuid)') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_has_subscription_for(uuid,text)') is null then
    raise exception 'Apply Canopy migrations 001–015 before this migration.';
  end if;
end $$;

create table if not exists public.canopy_partner_profile_consents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  sme_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz,
  revoked_at timestamptz,
  unique(partner_id,sme_id)
);
alter table public.canopy_partner_profile_consents enable row level security;
drop policy if exists canopy_partner_profile_consents_read on public.canopy_partner_profile_consents;
create policy canopy_partner_profile_consents_read on public.canopy_partner_profile_consents for select to authenticated
  using (sme_id=auth.uid() or public.canopy_is_admin());
revoke all on public.canopy_partner_profile_consents from anon,authenticated;
grant select on public.canopy_partner_profile_consents to authenticated;

create or replace function public.canopy_capture_verified_sme_referral(p_sme_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare code_value text; partner uuid;
begin
  if not exists(select 1 from public.profiles p where p.id=p_sme_id and p.role::text='sme')
     or public.canopy_effective_account_status(p_sme_id) is distinct from 'verified'
     or public.canopy_is_account_active(p_sme_id) is not true then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('canopy-referral:' || p_sme_id::text,0));
  if exists(select 1 from public.canopy_partner_referrals where sme_id=p_sme_id) then return; end if;
  select upper(nullif(trim(u.raw_user_meta_data->>'referral_code'),'')) into code_value from auth.users u where u.id=p_sme_id;
  if code_value is null then return; end if;
  select c.partner_id into partner from public.canopy_partner_codes c
    where upper(trim(c.code))=code_value and c.active is true
      and public.canopy_effective_account_status(c.partner_id)='verified'
      and public.canopy_is_account_active(c.partner_id) is true
      and public.canopy_has_subscription_for(c.partner_id,'partner') is true;
  if partner is null then return; end if;
  insert into public.canopy_partner_referrals(partner_id,sme_id,code) values(partner,p_sme_id,code_value)
    on conflict(sme_id) do nothing;
end;
$$;

create or replace function public.canopy_capture_verified_sme_referral_trigger()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin perform public.canopy_capture_verified_sme_referral(new.id); return new; end; $$;
drop trigger if exists canopy_capture_verified_sme_referral on public.profiles;
create trigger canopy_capture_verified_sme_referral after insert or update of verification_status on public.profiles
  for each row when (new.role::text='sme' and new.verification_status::text='verified')
  execute function public.canopy_capture_verified_sme_referral_trigger();
create or replace function public.canopy_capture_reactivated_sme_referral_trigger()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin perform public.canopy_capture_verified_sme_referral(new.user_id); return new; end; $$;
drop trigger if exists canopy_capture_reactivated_sme_referral on public.canopy_account_access_controls;
create trigger canopy_capture_reactivated_sme_referral after insert or update of access_status on public.canopy_account_access_controls
  for each row when (new.access_status='active')
  execute function public.canopy_capture_reactivated_sme_referral_trigger();
select public.canopy_capture_verified_sme_referral(p.id) from public.profiles p
  where p.role::text='sme' and public.canopy_effective_account_status(p.id)='verified'
    and public.canopy_is_account_active(p.id) is true;

create or replace function public.canopy_set_partner_profile_consent(p_partner_id uuid,p_granted boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare result public.canopy_partner_profile_consents;
begin
  if p_partner_id is null or p_granted is null then raise exception 'Partner and consent choice are required.' using errcode='22023'; end if;
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='sme')
     or public.canopy_effective_account_status(auth.uid()) is distinct from 'verified'
     or public.canopy_is_account_active(auth.uid()) is not true then raise exception 'An active verified SME account is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.canopy_partner_referrals r where r.sme_id=auth.uid() and r.partner_id=p_partner_id) then raise exception 'Profile sharing is available only to your referring Partner.' using errcode='42501'; end if;
  if p_granted and (public.canopy_effective_account_status(p_partner_id) is distinct from 'verified' or public.canopy_is_account_active(p_partner_id) is not true or public.canopy_has_subscription_for(p_partner_id,'partner') is not true) then raise exception 'Partner subscription is not active.' using errcode='42501'; end if;
  insert into public.canopy_partner_profile_consents(partner_id,sme_id,granted_at,revoked_at) values(p_partner_id,auth.uid(),case when p_granted then now() else null end,case when p_granted then null else now() end)
  on conflict(partner_id,sme_id) do update set granted_at=case when p_granted then now() else canopy_partner_profile_consents.granted_at end,revoked_at=case when p_granted then null else now() end returning * into result;
  return to_jsonb(result);
end;
$$;

create or replace function public.canopy_partner_referred_smes()
returns table(sme_id uuid,company_name text,sector text,verification_status text,linked_at timestamptz,profile_shared boolean)
language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$ begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='partner') or public.canopy_effective_account_status(auth.uid()) is distinct from 'verified' or public.canopy_is_account_active(auth.uid()) is not true or public.canopy_has_subscription_for(auth.uid(),'partner') is not true then raise exception 'An active verified Partner subscription is required.' using errcode='42501'; end if;
  return query select case when c.granted_at is not null and c.revoked_at is null and public.canopy_effective_account_status(r.sme_id)='verified' and public.canopy_is_account_active(r.sme_id) is true then r.sme_id else null end,
    case when c.granted_at is not null and c.revoked_at is null and public.canopy_effective_account_status(r.sme_id)='verified' and public.canopy_is_account_active(r.sme_id) is true then p.company_name::text else null end,
    case when c.granted_at is not null and c.revoked_at is null and public.canopy_effective_account_status(r.sme_id)='verified' and public.canopy_is_account_active(r.sme_id) is true then p.sector::text else null end,
    public.canopy_effective_account_status(r.sme_id),r.created_at,(c.granted_at is not null and c.revoked_at is null and public.canopy_effective_account_status(r.sme_id)='verified' and public.canopy_is_account_active(r.sme_id) is true)
  from public.canopy_partner_referrals r join public.profiles p on p.id=r.sme_id
  left join public.canopy_partner_profile_consents c on c.partner_id=r.partner_id and c.sme_id=r.sme_id
  where r.partner_id=auth.uid() order by r.created_at desc;
end; $$;

create or replace function public.canopy_partner_referred_sme_profile(p_sme_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth
as $$ begin
  if not exists(select 1 from public.canopy_partner_referred_smes() r where r.sme_id=p_sme_id and r.profile_shared) then raise exception 'SME business profile has not been shared.' using errcode='42501'; end if;
  return (select jsonb_build_object('company_name',p.company_name,'sector',p.sector,'verification_status',public.canopy_effective_account_status(p.id)) from public.profiles p where p.id=p_sme_id);
end; $$;

revoke all on function public.canopy_capture_verified_sme_referral(uuid),public.canopy_capture_verified_sme_referral_trigger(),public.canopy_capture_reactivated_sme_referral_trigger() from public,anon,authenticated;
revoke all on function public.canopy_set_partner_profile_consent(uuid,boolean),public.canopy_partner_referred_smes(),public.canopy_partner_referred_sme_profile(uuid) from public,anon;
grant execute on function public.canopy_set_partner_profile_consent(uuid,boolean),public.canopy_partner_referred_smes(),public.canopy_partner_referred_sme_profile(uuid) to authenticated;
commit;
