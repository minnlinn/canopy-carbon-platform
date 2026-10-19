-- Fixes full Partner-data-consent revocation without changing referral or profile consent.
-- Apply after migrations 001–017. This migration is intentionally safe to retry.

do $$
begin
  if to_regclass('public.canopy_partner_client_consents') is null
     or to_regprocedure('public.canopy_effective_account_status(uuid)') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_has_subscription_for(uuid,text)') is null then
    raise exception 'Canopy consent-revocation prerequisites are missing.';
  end if;
end;
$$;

create or replace function public.canopy_set_partner_client_consent(p_partner_id uuid,p_granted boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  consent_row public.canopy_partner_client_consents;
begin
  if p_partner_id is null or p_granted is null then
    raise exception 'Partner and consent decision are required.' using errcode='22023';
  end if;
  if auth.uid() is null
     or not exists (
       select 1 from public.profiles p
       where p.id=auth.uid() and p.role::text='sme'
     )
     or public.canopy_effective_account_status(auth.uid()) is distinct from 'verified'
     or public.canopy_is_account_active(auth.uid()) is not true then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.canopy_partner_referrals r
    where r.partner_id=p_partner_id and r.sme_id=auth.uid()
  ) then
    raise exception 'Consent can be changed only for the referring Partner.' using errcode='42501';
  end if;

  if p_granted then
    if public.canopy_effective_account_status(p_partner_id) is distinct from 'verified'
       or public.canopy_is_account_active(p_partner_id) is not true
       or public.canopy_has_subscription_for(p_partner_id,'partner') is not true then
      raise exception 'Partner subscription is not active.' using errcode='42501';
    end if;
    insert into public.canopy_partner_client_consents(partner_id,sme_id,granted_at,revoked_at)
    values(p_partner_id,auth.uid(),now(),null)
    on conflict(partner_id,sme_id) do update
      set granted_at=excluded.granted_at, revoked_at=null
    returning * into consent_row;
  else
    -- Revoke never inserts: granted_at is NOT NULL and historical grant time is retained.
    update public.canopy_partner_client_consents
      set revoked_at=coalesce(revoked_at,now())
      where partner_id=p_partner_id and sme_id=auth.uid()
      returning * into consent_row;
    if not found then
      raise exception 'No full Partner-data consent exists to revoke.' using errcode='P0002';
    end if;
  end if;
  return to_jsonb(consent_row);
end;
$$;

-- Every Partner detailed-data RPC and RLS policy calls this helper. Keep the
-- referring relationship, current account state, subscription, and consent in
-- one NULL-safe predicate so a revocation takes effect on the next request.
create or replace function public.canopy_partner_can_access_sme(p_sme_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p_sme_id is not null
     and exists (
       select 1
       from public.profiles partner
       where partner.id=auth.uid()
         and partner.role::text='partner'
         and public.canopy_effective_account_status(partner.id)='verified'
         and public.canopy_is_account_active(partner.id) is true
         and public.canopy_has_subscription_for(partner.id,'partner') is true
     )
     and exists (
       select 1
       from public.profiles sme
       where sme.id=p_sme_id
         and sme.role::text='sme'
         and public.canopy_effective_account_status(sme.id)='verified'
         and public.canopy_is_account_active(sme.id) is true
     )
     and exists (
       select 1
       from public.canopy_partner_referrals r
       join public.canopy_partner_client_consents c
         on c.partner_id=r.partner_id and c.sme_id=r.sme_id
       where r.partner_id=auth.uid()
         and r.sme_id=p_sme_id
         and c.granted_at is not null
         and c.revoked_at is null
     );
$$;

revoke all on function public.canopy_partner_can_access_sme(uuid) from public, anon;
grant execute on function public.canopy_partner_can_access_sme(uuid) to authenticated;
revoke all on function public.canopy_set_partner_client_consent(uuid,boolean) from public, anon;
grant execute on function public.canopy_set_partner_client_consent(uuid,boolean) to authenticated;
