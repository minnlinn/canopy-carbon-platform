-- Privacy-safe SME simulated purchase contribution. Apply after migrations 001–012.
-- The RPC returns no identifiers, categories, dates, or user-controlled breakdowns.

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_demo_trade_requests') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null then
    raise exception 'Apply Canopy migrations 001–012 before this SME aggregate migration.';
  end if;
end;
$$;

create or replace function public.canopy_sme_purchase_contribution()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
  my_total numeric := 0;
  other_total numeric := 0;
  other_sme_count integer := 0;
  approximate_share integer := 0;
begin
  if actor is null
     or public.canopy_is_account_active(actor) is not true
     or not exists (
       select 1 from public.profiles p
       where p.id = actor and p.role::text = 'sme'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'An active verified SME account is required.' using errcode = '42501';
  end if;

  with approved_activity as (
    select r.user_id, r.quantity_tco2e::numeric as quantity_tco2e
    from public.canopy_demo_purchase_requests r
    where r.request_status = 'approved_demo'
    union all
    select t.buyer_id, t.quantity_tco2e::numeric
    from public.canopy_demo_trade_requests t
    where t.status = 'approved_demo'
  ), active_sme_totals as (
    select a.user_id, sum(a.quantity_tco2e) as quantity_tco2e
    from approved_activity a
    join public.profiles p on p.id = a.user_id
    where p.role::text = 'sme'
      and p.verification_status::text = 'verified'
      and public.canopy_is_account_active(p.id) is true
    group by a.user_id
  )
  select coalesce((select quantity_tco2e from active_sme_totals where user_id = actor), 0),
         coalesce((select sum(quantity_tco2e) from active_sme_totals where user_id <> actor), 0),
         (select count(*) from active_sme_totals where user_id <> actor)
    into my_total, other_total, other_sme_count;

  -- A fixed, platform-wide comparison is released only if at least three other
  -- active, verified SMEs have approved activity. No cohort count is returned.
  if other_sme_count < 3 then
    return jsonb_build_object(
      'comparison_available', false,
      'message', 'Insufficient aggregated data for a privacy-safe comparison.',
      'demo_only', true
    );
  end if;

  approximate_share := least(100, greatest(0, round(((my_total / nullif(my_total + other_total, 0)) * 100) / 10) * 10))::integer;

  return jsonb_build_object(
    'comparison_available', true,
    'my_purchase_tco2e', round(my_total, 2),
    'my_approximate_percentage', approximate_share,
    'demo_only', true,
    'metric_note', 'Approximate share of simulated purchase activity, rounded to the nearest 10%; not current holdings, environmental impact, or emissions reduction.'
  );
end;
$$;

revoke all on function public.canopy_sme_purchase_contribution() from public, anon;
grant execute on function public.canopy_sme_purchase_contribution() to authenticated;
