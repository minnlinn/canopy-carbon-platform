-- Canopy Admin dashboard aggregates. Apply after migrations 001–011.
-- Returns simulated prototype receipts only; this is not formal accounting revenue.

do $$
begin
  if to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_demo_trade_requests') is null
     or to_regclass('public.canopy_billing_orders') is null
     or to_regprocedure('public.canopy_is_admin()') is null then
    raise exception 'Apply Canopy migrations 001–011 before this Admin chart migration.';
  end if;
end;
$$;

create or replace function public.canopy_admin_simulated_revenue_charts()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare result jsonb;
begin
  if auth.uid() is null or public.canopy_is_admin() is not true then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  with simulated_receipts as (
    select 'transaction_fees'::text as stream, reviewed_at as occurred_at,
      coalesce(simulated_platform_fee_myr, 0)::numeric as amount_myr
    from public.canopy_demo_purchase_requests
    where request_status = 'approved_demo' and reviewed_at is not null
    union all
    select 'transaction_fees'::text, reviewed_at,
      coalesce(platform_fee_myr, 0)::numeric
    from public.canopy_demo_trade_requests
    where status = 'approved_demo' and reviewed_at is not null
    union all
    select case order_type
      when 'premium_subscription' then 'premium'
      when 'esg_report' then 'esg_reports'
      when 'partner_subscription' then 'partner_subscriptions'
    end, paid_at, amount_myr::numeric
    from public.canopy_billing_orders
    where payment_status = 'sandbox_paid' and paid_at is not null
      and order_type in ('premium_subscription', 'esg_report', 'partner_subscription')
  ), stream_rows as (
    select stream, round(sum(amount_myr), 2) as amount_myr
    from simulated_receipts
    group by stream
  ), stream_totals as (
    select v.stream, coalesce(s.amount_myr, 0)::numeric as amount_myr
    from (values ('transaction_fees'::text), ('premium'), ('esg_reports'), ('partner_subscriptions')) v(stream)
    left join stream_rows s using (stream)
  ), days as (
    select generate_series(
      (now() at time zone 'Asia/Kuala_Lumpur')::date - 6,
      (now() at time zone 'Asia/Kuala_Lumpur')::date,
      interval '1 day'
    )::date as day
  ), daily_totals as (
    select d.day, coalesce(round(sum(r.amount_myr), 2), 0)::numeric as amount_myr
    from days d
    left join simulated_receipts r on r.occurred_at >= (d.day::timestamp at time zone 'Asia/Kuala_Lumpur')
      and r.occurred_at < ((d.day + 1)::timestamp at time zone 'Asia/Kuala_Lumpur')
    group by d.day
  )
  select jsonb_build_object(
    'streams', (select jsonb_object_agg(stream, amount_myr) from stream_totals),
    'daily', (select jsonb_agg(jsonb_build_object('day', day, 'amount_myr', amount_myr) order by day) from daily_totals),
    'target_myr', null
  ) into result;

  return result;
end;
$$;

revoke all on function public.canopy_admin_simulated_revenue_charts() from public, anon;
grant execute on function public.canopy_admin_simulated_revenue_charts() to authenticated;
