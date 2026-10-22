-- Partner Profile. Apply after Migration 020; column guards also support a clean upgrade path.
alter table public.profiles add column if not exists company_description text;
alter table public.profiles add column if not exists business_address text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles add column if not exists business_phone text;
alter table public.profiles add column if not exists partner_contact_visible boolean not null default false;

create or replace function public.canopy_partner_profile()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare actor uuid := auth.uid();
begin
  if actor is null
     or public.canopy_effective_account_status(actor) is distinct from 'verified'
     or public.canopy_is_account_active(actor) is not true
     or not exists (select 1 from public.profiles p where p.id=actor and p.role::text='partner') then
    raise exception 'An active verified Partner account is required.' using errcode='42501';
  end if;

  return (select jsonb_build_object(
    'company_name', p.company_name,
    'registration_number', p.registration_number,
    'verification_status', public.canopy_effective_account_status(p.id),
    'contact_name', p.contact_name,
    'contact_email', p.contact_email,
    'business_phone', p.business_phone,
    'business_address', p.business_address,
    'website', p.website,
    'company_description', p.company_description,
    'partner_contact_visible', p.partner_contact_visible,
    'referral_code', (select c.code from public.canopy_partner_codes c where c.partner_id=p.id and c.active is true order by c.created_at asc limit 1)
  ) from public.profiles p where p.id=actor);
end;
$$;

create or replace function public.canopy_update_partner_profile(
  p_contact_name text,
  p_contact_email text,
  p_phone text,
  p_address text,
  p_website text,
  p_description text,
  p_partner_contact_visible boolean
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare actor uuid := auth.uid();
begin
  if p_partner_contact_visible is null then
    raise exception 'Choose whether referred SMEs can see your business contact details.' using errcode='22023';
  end if;
  if actor is null
     or public.canopy_effective_account_status(actor) is distinct from 'verified'
     or public.canopy_is_account_active(actor) is not true
     or not exists (select 1 from public.profiles p where p.id=actor and p.role::text='partner') then
    raise exception 'An active verified Partner account is required.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_contact_name,'')))>160
     or length(trim(coalesce(p_contact_email,'')))>254
     or length(trim(coalesce(p_phone,'')))>50
     or length(trim(coalesce(p_address,'')))>500
     or length(trim(coalesce(p_website,'')))>2048
     or length(trim(coalesce(p_description,'')))>2000 then
    raise exception 'One or more profile fields are too long.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_contact_email,'')),'') is not null
     and trim(p_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid contact email.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_website,'')),'') is not null
     and trim(p_website) !~* '^https://[^[:space:]]+$' then
    raise exception 'Website must use a valid HTTPS URL.' using errcode='22023';
  end if;

  update public.profiles set
    contact_name=nullif(trim(coalesce(p_contact_name,'')),''),
    contact_email=nullif(lower(trim(coalesce(p_contact_email,''))),''),
    business_phone=nullif(trim(coalesce(p_phone,'')),''),
    business_address=nullif(trim(coalesce(p_address,'')),''),
    website=nullif(trim(coalesce(p_website,'')),''),
    company_description=nullif(trim(coalesce(p_description,'')),''),
    partner_contact_visible=p_partner_contact_visible
  where id=actor;

  return public.canopy_partner_profile();
end;
$$;

-- This public-business contact view is independent of the SME's separate profile
-- and full-carbon-data consents. Details are released only when the Partner opts in.
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
    'partner_id',r.partner_id,
    'partner_name',p.company_name,
    'contact_visible',p.partner_contact_visible,
    'contact_name',case when p.partner_contact_visible then p.contact_name else null end,
    'contact_email',case when p.partner_contact_visible then p.contact_email else null end,
    'business_phone',case when p.partner_contact_visible then p.business_phone else null end,
    'website',case when p.partner_contact_visible then p.website else null end,
    'company_description',case when p.partner_contact_visible then p.company_description else null end,
    'referral_code',r.code,
    'profile_granted',(pc.granted_at is not null and pc.revoked_at is null),
    'full_granted',(cc.granted_at is not null and cc.revoked_at is null)
  ) order by r.created_at desc)
  from public.canopy_partner_referrals r
  join public.profiles p on p.id=r.partner_id
  left join public.canopy_partner_profile_consents pc on pc.partner_id=r.partner_id and pc.sme_id=actor
  left join public.canopy_partner_client_consents cc on cc.partner_id=r.partner_id and cc.sme_id=actor
  where r.sme_id=actor and p.role::text='partner'
    and public.canopy_effective_account_status(p.id)='verified'
    and public.canopy_is_account_active(p.id) is true
    and public.canopy_has_subscription_for(p.id,'partner') is true
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.canopy_partner_profile() from public, anon;
revoke all on function public.canopy_update_partner_profile(text,text,text,text,text,text,boolean) from public, anon;
revoke all on function public.canopy_sme_partner_access() from public, anon;
grant execute on function public.canopy_partner_profile() to authenticated;
grant execute on function public.canopy_update_partner_profile(text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.canopy_sme_partner_access() to authenticated;