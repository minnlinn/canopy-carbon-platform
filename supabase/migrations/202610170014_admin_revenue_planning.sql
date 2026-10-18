-- Admin-only simulated revenue targets and planning assumptions. Apply after migrations 001–013.

do $$
begin
  if to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_demo_trade_requests') is null
     or to_regclass('public.canopy_billing_orders') is null
     or to_regprocedure('public.canopy_is_admin()') is null then
    raise exception 'Apply Canopy migrations 001–013 before revenue planning.';
  end if;
end;
$$;

create table if not exists public.canopy_admin_revenue_targets (
  month_start date primary key,
  target_myr numeric(14,2) not null check (target_myr >= 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  check (month_start = date_trunc('month', month_start)::date)
);

create table if not exists public.canopy_admin_revenue_forecast (
  singleton boolean primary key default true check (singleton),
  active_smes integer not null default 500 check (active_smes >= 0),
  average_transaction_value_myr numeric(14,2) not null default 20 check (average_transaction_value_myr >= 0),
  transactions_per_sme numeric(14,2) not null default 4 check (transactions_per_sme >= 0),
  premium_subscribers integer not null default 100 check (premium_subscribers >= 0),
  premium_price_myr numeric(14,2) not null default 250 check (premium_price_myr >= 0),
  report_count integer not null default 20 check (report_count >= 0),
  report_price_myr numeric(14,2) not null default 500 check (report_price_myr >= 0),
  partner_subscribers integer not null default 10 check (partner_subscribers >= 0),
  partner_price_myr numeric(14,2) not null default 500 check (partner_price_myr >= 0),
  configured_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.canopy_admin_revenue_forecast(singleton) values (true) on conflict (singleton) do nothing;

alter table public.canopy_admin_revenue_targets enable row level security;
alter table public.canopy_admin_revenue_forecast enable row level security;
revoke all on public.canopy_admin_revenue_targets, public.canopy_admin_revenue_forecast from anon, authenticated;

create or replace function public.canopy_admin_revenue_planning(p_month date default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare selected_month date; selected_target numeric; receipts numeric; forecast public.canopy_admin_revenue_forecast;
begin
  if auth.uid() is null or public.canopy_is_admin() is not true then raise exception 'Administrator access required.' using errcode='42501'; end if;
  selected_month := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Kuala_Lumpur')::date))::date;
  select target_myr into selected_target from public.canopy_admin_revenue_targets where month_start=selected_month;
  select * into forecast from public.canopy_admin_revenue_forecast where singleton=true;
  with receipts as (
    select reviewed_at as occurred_at, coalesce(simulated_platform_fee_myr,0)::numeric amount_myr from public.canopy_demo_purchase_requests where request_status='approved_demo' and reviewed_at is not null
    union all select reviewed_at, coalesce(platform_fee_myr,0)::numeric from public.canopy_demo_trade_requests where status='approved_demo' and reviewed_at is not null
    union all select paid_at, amount_myr::numeric from public.canopy_billing_orders where payment_status='sandbox_paid' and paid_at is not null and order_type in ('premium_subscription','partner_subscription','esg_report')
  )
  select coalesce(round(sum(amount_myr),2),0) into receipts from receipts
  where occurred_at >= (selected_month::timestamp at time zone 'Asia/Kuala_Lumpur')
    and occurred_at < ((selected_month + interval '1 month')::timestamp at time zone 'Asia/Kuala_Lumpur');
  return jsonb_build_object('month_start',selected_month,'target_myr',selected_target,'receipts_myr',receipts,
    'forecast',to_jsonb(forecast),'forecast_saved',(forecast.configured_by is not null));
end;
$$;

create or replace function public.canopy_admin_set_revenue_target(p_month date,p_target_myr numeric)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare row_data public.canopy_admin_revenue_targets; normalized_month date;
begin
  if auth.uid() is null or public.canopy_is_admin() is not true then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_month is null or p_target_myr is null or p_target_myr<0 then raise exception 'A valid month and non-negative simulated revenue target are required.' using errcode='22023'; end if;
  normalized_month := date_trunc('month',p_month)::date;
  insert into public.canopy_admin_revenue_targets(month_start,target_myr,updated_by) values(normalized_month,round(p_target_myr,2),auth.uid())
  on conflict(month_start) do update set target_myr=excluded.target_myr,updated_by=auth.uid(),updated_at=now() returning * into row_data;
  return to_jsonb(row_data);
end;
$$;

create or replace function public.canopy_admin_set_revenue_forecast(p_assumptions jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare row_data public.canopy_admin_revenue_forecast;
begin
  if auth.uid() is null or public.canopy_is_admin() is not true then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_assumptions is null then raise exception 'Forecast assumptions are required.' using errcode='22023'; end if;
  update public.canopy_admin_revenue_forecast set
    active_smes=(p_assumptions->>'active_smes')::integer,
    average_transaction_value_myr=(p_assumptions->>'average_transaction_value_myr')::numeric,
    transactions_per_sme=(p_assumptions->>'transactions_per_sme')::numeric,
    premium_subscribers=(p_assumptions->>'premium_subscribers')::integer,
    premium_price_myr=(p_assumptions->>'premium_price_myr')::numeric,
    report_count=(p_assumptions->>'report_count')::integer,
    report_price_myr=(p_assumptions->>'report_price_myr')::numeric,
    partner_subscribers=(p_assumptions->>'partner_subscribers')::integer,
    partner_price_myr=(p_assumptions->>'partner_price_myr')::numeric,
    configured_by=auth.uid(),updated_at=now()
  where singleton=true returning * into row_data;
  return to_jsonb(row_data);
end;
$$;

revoke all on function public.canopy_admin_revenue_planning(date), public.canopy_admin_set_revenue_target(date,numeric), public.canopy_admin_set_revenue_forecast(jsonb) from public, anon;
grant execute on function public.canopy_admin_revenue_planning(date), public.canopy_admin_set_revenue_target(date,numeric), public.canopy_admin_set_revenue_forecast(jsonb) to authenticated;
