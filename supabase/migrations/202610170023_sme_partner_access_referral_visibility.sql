-- Keep referral attribution visible to the linked SME even while the Partner is
-- temporarily ineligible for data sharing. Consent remains independently guarded.
begin;

do $$
begin
  if to_regclass('public.canopy_partner_referrals') is null
     or to_regclass('public.canopy_partner_profile_consents') is null
     or to_regclass('public.canopy_partner_client_consents') is null
     or to_regclass('public.canopy_partner_contact_consents') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_effective_account_status(uuid)') is null
     or to_regprocedure('public.canopy_has_subscription_for(uuid,text)') is null then
    raise exception 'Apply Canopy migrations 001–022 before this migration.';
  end if;
end;
$$;

create or replace function public.canopy_sme_partner_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null
     or public.canopy_effective_account_status(actor) is distinct from 'verified'
     or public.canopy_is_account_active(actor) is not true
     or not exists (select 1 from public.profiles where id=actor and role::text='sme') then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'partner_id', r.partner_id,
      'partner_name', p.company_name,
      'contact_visible', p.partner_contact_visible,
      'contact_name', case when p.partner_contact_visible then p.contact_name else null end,
      'contact_email', case when p.partner_contact_visible then p.contact_email else null end,
      'business_phone', case when p.partner_contact_visible then p.business_phone else null end,
      'website', case when p.partner_contact_visible then p.website else null end,
      'company_description', case when p.partner_contact_visible then p.company_description else null end,
      'referral_code', r.code,
      'partner_available', (
        public.canopy_effective_account_status(p.id) = 'verified'
        and public.canopy_is_account_active(p.id) is true
        and public.canopy_has_subscription_for(p.id, 'partner') is true
      ),
      'profile_granted', (pc.granted_at is not null and pc.revoked_at is null),
      'contact_granted', (ct.granted_at is not null and ct.revoked_at is null),
      'full_granted', (cc.granted_at is not null and cc.revoked_at is null)
    ) order by r.created_at desc)
    from public.canopy_partner_referrals r
    join public.profiles p on p.id=r.partner_id
    left join public.canopy_partner_profile_consents pc on pc.partner_id=r.partner_id and pc.sme_id=actor
    left join public.canopy_partner_contact_consents ct on ct.partner_id=r.partner_id and ct.sme_id=actor
    left join public.canopy_partner_client_consents cc on cc.partner_id=r.partner_id and cc.sme_id=actor
    where r.sme_id=actor and p.role::text='partner'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.canopy_sme_partner_access() from public, anon;
grant execute on function public.canopy_sme_partner_access() to authenticated;

commit;
