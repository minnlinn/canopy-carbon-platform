-- Secure, one-time SME referral attribution. Run after migrations 001–014.
begin;

do $$
begin
  if to_regclass('public.canopy_partner_codes') is null
     or to_regclass('public.canopy_partner_referrals') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_effective_account_status(uuid)') is null
     or to_regprocedure('public.canopy_has_subscription_for(uuid,text)') is null then
    raise exception 'Apply Canopy migrations 001–014 before Partner referral attribution.';
  end if;
end;
$$;

create or replace function public.canopy_claim_partner_referral(p_code text default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  code_value text;
  partner_id uuid;
  partner_name text;
  referral public.canopy_partner_referrals;
begin
  if actor is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  select p.role::text into actor_role from public.profiles p where p.id=actor;
  if actor_role is distinct from 'sme'
     or public.canopy_effective_account_status(actor) is distinct from 'verified'
     or public.canopy_is_account_active(actor) is not true then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('canopy-referral:' || actor::text, 0));
  select * into referral from public.canopy_partner_referrals where sme_id=actor for update;
  if found then
    select p.company_name::text into partner_name from public.profiles p where p.id=referral.partner_id;
    code_value := upper(coalesce(nullif(trim(p_code),''),nullif(trim(auth.jwt()->'user_metadata'->>'referral_code'),'')));
    if code_value is not null and code_value <> upper(trim(referral.code)) then
      raise exception 'A Partner referral is already linked to this SME account.' using errcode='22023';
    end if;
    return jsonb_build_object('referral',to_jsonb(referral),'partner_name',partner_name,'newly_linked',false);
  end if;

  code_value := upper(coalesce(nullif(trim(p_code),''),nullif(trim(auth.jwt()->'user_metadata'->>'referral_code'),'')));
  if code_value is null then raise exception 'Enter a Partner referral code.' using errcode='22023'; end if;
  select c.partner_id,p.company_name::text into partner_id,partner_name
    from public.canopy_partner_codes c
    join public.profiles p on p.id=c.partner_id
    where upper(trim(c.code))=code_value and c.active is true
      and public.canopy_has_subscription_for(c.partner_id,'partner') is true;
  if partner_id is null then raise exception 'Referral code is invalid or inactive.' using errcode='22023'; end if;

  insert into public.canopy_partner_referrals(partner_id,sme_id,code)
    values(partner_id,actor,code_value) returning * into referral;
  return jsonb_build_object('referral',to_jsonb(referral),'partner_name',partner_name,'newly_linked',true);
end;
$$;

create or replace function public.canopy_sme_referral_status()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare actor uuid := auth.uid();
begin
  if actor is null
     or not exists(select 1 from public.profiles p where p.id=actor and p.role::text='sme')
     or public.canopy_effective_account_status(actor) is distinct from 'verified'
     or public.canopy_is_account_active(actor) is not true then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  return coalesce(
    (select jsonb_build_object('has_referral',true,'partner_name',p.company_name,'code',r.code)
      from public.canopy_partner_referrals r join public.profiles p on p.id=r.partner_id
      where r.sme_id=actor),
    jsonb_build_object('has_referral',false)
  );
end;
$$;

create or replace function public.canopy_partner_referral_statistics()
returns table(total_referred bigint, verified_referred bigint)
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null
     or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='partner')
     or public.canopy_effective_account_status(auth.uid()) is distinct from 'verified'
     or public.canopy_is_account_active(auth.uid()) is not true
     or public.canopy_has_subscription_for(auth.uid(),'partner') is not true then
    raise exception 'An active verified Partner subscription is required.' using errcode='42501';
  end if;
  return query select count(*)::bigint,
    count(*) filter(where public.canopy_effective_account_status(r.sme_id)='verified')::bigint
  from public.canopy_partner_referrals r where r.partner_id=auth.uid();
end;
$$;

revoke all on function public.canopy_claim_partner_referral(text) from public, anon;
revoke all on function public.canopy_sme_referral_status() from public, anon;
revoke all on function public.canopy_partner_referral_statistics() from public, anon;
grant execute on function public.canopy_claim_partner_referral(text) to authenticated;
grant execute on function public.canopy_sme_referral_status() to authenticated;
grant execute on function public.canopy_partner_referral_statistics() to authenticated;

commit;
