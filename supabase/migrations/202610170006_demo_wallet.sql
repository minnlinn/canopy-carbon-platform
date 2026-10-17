-- Canopy demonstration wallet. Run once after migrations 001–005.
-- Demo only: this records no real money, payment, bank transfer, or carbon-credit ownership.
BEGIN;

do $$
begin
  if to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_demo_entitlement_ledger') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null then
    raise exception 'Apply Canopy migrations 001–005 before the demonstration wallet migration.';
  end if;
end;
$$;

create table if not exists public.canopy_demo_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('top_up','purchase_reserve','purchase_refund')),
  amount_myr numeric(14,2) not null check (amount_myr <> 0),
  idempotency_key text not null,
  purchase_request_id uuid references public.canopy_demo_purchase_requests(id),
  note text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.canopy_demo_wallet_transactions enable row level security;
drop policy if exists canopy_demo_wallet_owner_admin_read on public.canopy_demo_wallet_transactions;
drop policy if exists canopy_active_demo_wallet_gate on public.canopy_demo_wallet_transactions;
create policy canopy_demo_wallet_owner_admin_read on public.canopy_demo_wallet_transactions for select to authenticated
  using (user_id=auth.uid() or public.is_admin());
create policy canopy_active_demo_wallet_gate on public.canopy_demo_wallet_transactions as restrictive for select to authenticated
  using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));
revoke all on public.canopy_demo_wallet_transactions from anon, authenticated;
grant select on public.canopy_demo_wallet_transactions to authenticated;

create or replace function public.canopy_demo_wallet_summary()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare actor uuid:=auth.uid(); balance numeric(14,2); transactions jsonb;
begin
  if actor is null or not public.canopy_is_account_active(actor)
     or not exists(select 1 from public.profiles where id=actor and role::text='sme') then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  select coalesce(sum(amount_myr),0) into balance from public.canopy_demo_wallet_transactions where user_id=actor;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'transaction_type',transaction_type,'amount_myr',amount_myr,'note',note,'created_at',created_at) order by created_at desc,id desc),'[]'::jsonb)
    into transactions from public.canopy_demo_wallet_transactions where user_id=actor;
  return jsonb_build_object('balance_myr',balance,'transactions',transactions,'currency','MYR','demo_only',true);
end;
$$;

create or replace function public.canopy_demo_wallet_top_up(p_amount_myr numeric,p_idempotency_key text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare actor uuid:=auth.uid(); wallet_row public.canopy_demo_wallet_transactions;
begin
  if actor is null or not public.canopy_is_account_active(actor)
     or not exists(select 1 from public.profiles where id=actor and role::text='sme') then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  if p_amount_myr is null or p_amount_myr<1 or p_amount_myr<>round(p_amount_myr,2)
     or length(trim(coalesce(p_idempotency_key,'')))<12 then
    raise exception 'Enter a demo top-up of at least RM1.00 with a valid unique key.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
  insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,note)
    values(actor,'top_up',p_amount_myr,trim(p_idempotency_key),'Demo top-up only; no real money received.')
    on conflict(user_id,idempotency_key) do nothing;
  select * into wallet_row from public.canopy_demo_wallet_transactions
    where user_id=actor and idempotency_key=trim(p_idempotency_key);
  return to_jsonb(wallet_row);
end;
$$;

create or replace function public.canopy_request_demo_purchase(p_project_id uuid,p_quantity numeric)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare actor uuid:=auth.uid(); project_row public.canopy_demo_projects; allocated numeric(14,2); pending numeric(14,2); credit_value numeric(14,2); fee numeric(14,2); available_balance numeric(14,2); request_row public.canopy_demo_purchase_requests;
begin
  if actor is null or not public.canopy_is_account_active(actor)
     or not exists(select 1 from public.profiles where id=actor and role::text='sme' and verification_status::text='verified') then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  if p_quantity<0.01 or p_quantity*100<>trunc(p_quantity*100) then raise exception 'Use quantities of at least 0.01 tCO2e in 0.01 increments.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
  select * into project_row from public.canopy_demo_projects where id=p_project_id and listing_active for update;
  if not found then raise exception 'Demonstration project is unavailable.' using errcode='P0002'; end if;
  if not project_row.demo_trading_enabled or project_row.simulated_price_myr is null then raise exception 'Demo trading has not been enabled for this listing.' using errcode='22023'; end if;
  select coalesce(sum(delta_tco2e),0) into allocated from public.canopy_demo_entitlement_ledger where project_id=p_project_id;
  select coalesce(sum(quantity_tco2e),0) into pending from public.canopy_demo_purchase_requests where project_id=p_project_id and request_status='pending_admin_review';
  if p_quantity>project_row.simulated_inventory_tco2e-allocated-pending then raise exception 'Not enough simulated available inventory.' using errcode='22023'; end if;
  credit_value:=round(project_row.simulated_price_myr*p_quantity,2); fee:=round(credit_value*0.015,2);
  select coalesce(sum(amount_myr),0) into available_balance from public.canopy_demo_wallet_transactions where user_id=actor;
  if available_balance<credit_value+fee then raise exception 'Insufficient Demo RM wallet balance. Top up demo funds first.' using errcode='22023'; end if;
  insert into public.canopy_demo_purchase_requests(user_id,project_id,quantity_tco2e,simulated_unit_price_myr,simulated_credit_value_myr,simulated_platform_fee_myr,simulated_total_myr)
    values(actor,p_project_id,p_quantity,project_row.simulated_price_myr,credit_value,fee,credit_value+fee) returning * into request_row;
  insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,purchase_request_id,note)
    values(actor,'purchase_reserve',-(credit_value+fee),'purchase-reserve:'||request_row.id::text,request_row.id,'Demo funds reserved pending Admin review; no real payment collected.');
  return to_jsonb(request_row);
end;
$$;

create or replace function public.canopy_admin_review_demo_purchase(p_admin_id uuid,p_request_id uuid,p_decision text,p_note text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare purchase public.canopy_demo_purchase_requests; project_row public.canopy_demo_projects; allocated numeric(14,2); other_pending numeric(14,2); next_status text;
begin
  if auth.uid() is distinct from p_admin_id or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_decision not in ('approve','reject') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Choose approve/reject and provide an audit note.' using errcode='22023'; end if;
  select * into purchase from public.canopy_demo_purchase_requests where id=p_request_id for update;
  if not found or purchase.request_status<>'pending_admin_review' then raise exception 'Only pending demo purchases can be reviewed.' using errcode='22023'; end if;
  select * into project_row from public.canopy_demo_projects where id=purchase.project_id for update;
  if p_decision='approve' then
    -- A previously verified SME may have been suspended or rejected while this
    -- request awaited review. It must not receive a new demo entitlement.
    if not public.canopy_is_account_active(purchase.user_id) then
      raise exception 'The SME is no longer active and verified; reject the request to return its reserved demo funds.' using errcode='42501';
    end if;
    select coalesce(sum(delta_tco2e),0) into allocated from public.canopy_demo_entitlement_ledger where project_id=purchase.project_id;
    select coalesce(sum(quantity_tco2e),0) into other_pending from public.canopy_demo_purchase_requests where project_id=purchase.project_id and request_status='pending_admin_review' and id<>p_request_id;
    if purchase.quantity_tco2e>project_row.simulated_inventory_tco2e-allocated-other_pending then raise exception 'Insufficient simulated inventory at approval.' using errcode='22023'; end if;
    insert into public.canopy_demo_entitlement_ledger(user_id,project_id,event_type,delta_tco2e,purchase_request_id,actor_id,note)
      values(purchase.user_id,purchase.project_id,'allocation',purchase.quantity_tco2e,purchase.id,p_admin_id,'Demo allocation only; no real carbon credits are transferred.') on conflict(purchase_request_id,event_type) do nothing;
    next_status:='approved_demo';
  else
    next_status:='rejected';
    insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,purchase_request_id,note)
      values(purchase.user_id,'purchase_refund',purchase.simulated_total_myr,'purchase-refund:'||purchase.id::text,purchase.id,'Demo reservation returned after Admin rejection; no real money refunded.')
      on conflict(user_id,idempotency_key) do nothing;
  end if;
  update public.canopy_demo_purchase_requests set request_status=next_status,review_note=trim(p_note),reviewed_by=p_admin_id,reviewed_at=now() where id=p_request_id returning * into purchase;
  return to_jsonb(purchase);
end;
$$;

revoke all on function public.canopy_demo_wallet_summary() from public,anon;
revoke all on function public.canopy_demo_wallet_top_up(numeric,text) from public,anon;
revoke all on function public.canopy_request_demo_purchase(uuid,numeric) from public,anon;
revoke all on function public.canopy_admin_review_demo_purchase(uuid,uuid,text,text) from public,anon;
grant execute on function public.canopy_demo_wallet_summary(), public.canopy_demo_wallet_top_up(numeric,text), public.canopy_request_demo_purchase(uuid,numeric), public.canopy_admin_review_demo_purchase(uuid,uuid,text,text) to authenticated;

COMMIT;
