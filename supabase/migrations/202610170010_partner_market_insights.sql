-- Privacy-preserving Partner market insights. Run after migrations 001–009.
-- Fixed aggregates only: no user-controlled filters and no SME-level rows are returned.

begin;

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_has_subscription(text)') is null then
    raise exception 'Apply Canopy migrations 001–009 before Partner market insights.';
  end if;
end;
$$;

create or replace function public.canopy_partner_market_insights()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  active_smes integer;
  purchase_smes integer;
begin
  if (
    public.canopy_is_account_active(auth.uid()) is true
    and public.canopy_has_subscription('partner') is true
    and exists (
      select 1 from public.profiles p
      where p.id=auth.uid() and p.role::text='partner'
        and p.verification_status::text='verified'
    )
  ) is not true then
    raise exception 'An active verified Partner Portal subscription is required.' using errcode='42501';
  end if;

  select count(*) into active_smes
  from public.profiles p
  where p.role::text='sme' and public.canopy_is_account_active(p.id);

  if active_smes < 3 then
    return jsonb_build_object('sufficient_data',false,'minimum_group_size',3,
      'message','Insufficient aggregated data. Metrics require at least three active SMEs.');
  end if;

  -- Only Admin-approved demo purchases are confirmed simulated activity. Legacy
  -- carbon_requests are intentionally excluded: they cannot prove a simulated retirement.
  select count(distinct r.user_id)
    into purchase_smes
  from public.canopy_demo_purchase_requests r join public.profiles p on p.id=r.user_id
  where r.request_status='approved_demo' and public.canopy_is_account_active(p.id);

  if purchase_smes < 3 then
    return jsonb_build_object(
      'sufficient_data',true,'minimum_group_size',3,'total_active_smes',active_smes,
      'breakdowns_available',false,
      'activity_available',false,
      'retirement_available',false,
      'message','Insufficient aggregated simulated purchase data. Metrics require records from at least three active SMEs.'
    );
  end if;

  return jsonb_build_object(
    'sufficient_data',true,'minimum_group_size',3,'total_active_smes',active_smes,
    'activity_available',false,
    'retirement_available',false,'breakdowns_available',false,
    'message','Approved simulated purchases meet the cohort threshold, but activity totals and all breakdowns are suppressed to prevent re-identification. Retirement metrics are unavailable because no confirmed simulated retirement source exists.',
    'demo_only',true
  );
end;
$$;

revoke all on function public.canopy_partner_market_insights() from public, anon;
grant execute on function public.canopy_partner_market_insights() to authenticated;

commit;
