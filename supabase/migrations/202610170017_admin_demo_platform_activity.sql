-- Admin-only aggregate metrics for Canopy's demo operations dashboard.
-- This exposes no SME identities, wallet balances, or individual transactions.
begin;

do $$
begin
  if to_regclass('public.canopy_demo_projects') is null
     or to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_demo_trade_requests') is null
     or to_regprocedure('public.canopy_is_admin()') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_effective_account_status(uuid)') is null then
    raise exception 'Apply Canopy migrations 001–011 before this admin activity migration.';
  end if;
end;
$$;

create or replace function public.canopy_admin_demo_platform_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  direct_count bigint;
  trade_count bigint;
  direct_quantity numeric;
  trade_quantity numeric;
  pending_count bigint;
  active_projects bigint;
begin
  -- canopy_is_admin() is role-only; account status must be checked separately.
  if auth.uid() is null
     or public.canopy_is_admin() is not true
     or public.canopy_is_account_active(auth.uid()) is not true
     or public.canopy_effective_account_status(auth.uid()) is distinct from 'verified'
     or not exists (
       select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role::text = 'admin'
         and p.verification_status::text = 'verified'
     ) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  select count(*), coalesce(sum(quantity_tco2e), 0)
    into direct_count, direct_quantity
  from public.canopy_demo_purchase_requests
  where request_status = 'approved_demo';

  select count(*), coalesce(sum(quantity_tco2e), 0)
    into trade_count, trade_quantity
  from public.canopy_demo_trade_requests
  where status = 'approved_demo';

  select count(*) into pending_count
  from (
    select id from public.canopy_demo_purchase_requests where request_status = 'pending_admin_review'
    union all
    select id from public.canopy_demo_trade_requests where status = 'pending_admin_review'
  ) as pending;

  select count(*) into active_projects
  from public.canopy_demo_projects
  where listing_active is true and demo_trading_enabled is true;

  return jsonb_build_object(
    'direct_approved_purchases', direct_count,
    'approved_sme_trades', trade_count,
    'direct_allocated_tco2e', direct_quantity,
    'trade_transferred_tco2e', trade_quantity,
    'pending_approvals', pending_count,
    'active_demo_projects', active_projects
  );
end;
$$;

revoke all on function public.canopy_admin_demo_platform_activity() from public, anon;
grant execute on function public.canopy_admin_demo_platform_activity() to authenticated;

commit;
