-- Fix the shared inactive-account trigger after migrations 001–006.
-- This is additive and does not change balances, requests, RLS, or pricing.
BEGIN;

do $$
begin
  if to_regprocedure('public.canopy_block_inactive_account_action()') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regclass('public.carbon_requests') is null
     or to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_billing_orders') is null then
    raise exception 'Apply Canopy migrations 001–006 before this trigger fix.';
  end if;
end;
$$;

create or replace function public.canopy_block_inactive_account_action()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid;
begin
  -- Use JSON extraction so this shared trigger never resolves a column that
  -- does not exist on the table currently firing it.
  if tg_table_name = 'carbon_requests' then
    actor_id := nullif(to_jsonb(new)->>'requester_id','')::uuid;
  elsif tg_table_name in ('canopy_demo_purchase_requests','canopy_billing_orders') then
    actor_id := nullif(to_jsonb(new)->>'user_id','')::uuid;
  else
    raise exception 'Unsupported Canopy account-action trigger table: %', tg_table_name using errcode='22023';
  end if;

  if actor_id is not null and not public.canopy_is_account_active(actor_id) and not public.canopy_is_admin() then
    raise exception 'This account is not verified or is suspended.' using errcode='42501';
  end if;
  return new;
end;
$$;

COMMIT;
