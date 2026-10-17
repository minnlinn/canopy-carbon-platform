-- Wallet-funded sandbox billing after migrations 001–006 (and 007 if required).
-- Demo only: no real money is collected.
BEGIN;

do $$
begin
  if to_regclass('public.canopy_demo_wallet_transactions') is null
     or to_regclass('public.canopy_billing_orders') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null
     or to_regprocedure('public.canopy_simulate_billing_payment(uuid)') is null then
    raise exception 'Apply Canopy migrations 001–006 before wallet-funded sandbox billing.';
  end if;
end;
$$;

alter table public.canopy_demo_wallet_transactions
  drop constraint if exists canopy_demo_wallet_transactions_transaction_type_check;
alter table public.canopy_demo_wallet_transactions
  add constraint canopy_demo_wallet_transactions_transaction_type_check
  check (transaction_type in ('top_up','purchase_reserve','purchase_refund','billing_payment'));

create or replace function public.canopy_demo_wallet_summary()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare actor uuid:=auth.uid(); balance numeric(14,2); transactions jsonb;
begin
  if actor is null or not public.canopy_is_account_active(actor)
     or not exists(select 1 from public.profiles where id=actor and role::text in ('sme','partner')) then
    raise exception 'An active verified SME or Partner account is required.' using errcode='42501';
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
     or not exists(select 1 from public.profiles where id=actor and role::text in ('sme','partner')) then
    raise exception 'An active verified SME or Partner account is required.' using errcode='42501';
  end if;
  if p_amount_myr is null or p_amount_myr<1 or p_amount_myr<>round(p_amount_myr,2)
     or length(trim(coalesce(p_idempotency_key,'')))<12 then
    raise exception 'Enter a demo top-up of at least RM1.00 with a valid unique key.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
  insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,note)
    values(actor,'top_up',p_amount_myr,trim(p_idempotency_key),'Demo top-up only; no real money received.')
    on conflict(user_id,idempotency_key) do nothing;
  select * into wallet_row from public.canopy_demo_wallet_transactions where user_id=actor and idempotency_key=trim(p_idempotency_key);
  return to_jsonb(wallet_row);
end;
$$;

create or replace function public.canopy_simulate_billing_payment(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare actor uuid:=auth.uid(); order_row public.canopy_billing_orders; payment_row public.canopy_demo_wallet_transactions; plan_name text; actor_role text; balance numeric(14,2); shortfall numeric(14,2); payment_key text;
begin
  if actor is null or not public.canopy_is_account_active(actor) then
    raise exception 'An active verified account is required.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,1));
  select * into order_row from public.canopy_billing_orders where id=p_order_id and user_id=actor for update;
  if not found then raise exception 'Checkout not found.' using errcode='P0002'; end if;
  if order_row.payment_mode<>'sandbox' then raise exception 'Sandbox checkout is disabled for this order.' using errcode='42501'; end if;
  if order_row.payment_status='sandbox_paid' then return to_jsonb(order_row); end if;
  if order_row.payment_status<>'pending' then raise exception 'Checkout is no longer payable.' using errcode='22023'; end if;
  select role::text into actor_role from public.profiles where id=actor;
  if (order_row.order_type in ('premium_subscription','esg_report') and actor_role<>'sme')
     or (order_row.order_type='partner_subscription' and actor_role<>'partner') then
    raise exception 'This account cannot pay for the requested sandbox item.' using errcode='42501';
  end if;
  payment_key:='billing-payment:'||order_row.id::text;
  select * into payment_row from public.canopy_demo_wallet_transactions
    where user_id=actor and idempotency_key=payment_key for update;
  if found then
    if payment_row.transaction_type<>'billing_payment'
       or payment_row.amount_myr<>-order_row.amount_myr
       or payment_row.purchase_request_id is not null then
      raise exception 'The existing demo wallet payment does not match this checkout.' using errcode='22023';
    end if;
  else
    select coalesce(sum(amount_myr),0) into balance from public.canopy_demo_wallet_transactions where user_id=actor;
    if balance<order_row.amount_myr then
      shortfall:=round(order_row.amount_myr-balance,2);
      if order_row.order_type in ('premium_subscription','partner_subscription') then
        raise exception 'Insufficient demo wallet balance. Please top up RM % to subscribe.', to_char(shortfall,'FM999999990.00') using errcode='22023';
      end if;
      raise exception 'Insufficient demo wallet balance. Please top up RM % to complete this demo purchase.', to_char(shortfall,'FM999999990.00') using errcode='22023';
    end if;
    insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,note)
      values(actor,'billing_payment',-order_row.amount_myr,payment_key,'Demo wallet payment for '||replace(order_row.order_type,'_',' ')||'; no real money collected.');
  end if;
  update public.canopy_billing_orders set payment_status='sandbox_paid',approval_status='approved',
    payment_reference='DEMO-'||upper(substr(replace(p_order_id::text,'-',''),1,12)),paid_at=now()
    where id=p_order_id returning * into order_row;
  if order_row.order_type in ('premium_subscription','partner_subscription') then
    plan_name:=case when order_row.order_type='premium_subscription' then 'premium' else 'partner' end;
    insert into public.canopy_subscriptions(user_id,plan,status,monthly_price_myr,billing_order_id,started_at,renewal_at,cancelled_at)
      values(actor,plan_name,'active_demo',order_row.amount_myr,order_row.id,now(),now()+interval '1 month',null)
      on conflict(user_id,plan) do update set status='active_demo',monthly_price_myr=excluded.monthly_price_myr,billing_order_id=excluded.billing_order_id,started_at=now(),renewal_at=now()+interval '1 month',cancelled_at=null;
  elsif order_row.order_type='esg_report' then
    update public.canopy_report_requests set status='ready_demo' where billing_order_id=order_row.id and user_id=actor;
  end if;
  return to_jsonb(order_row);
end;
$$;

revoke all on function public.canopy_simulate_billing_payment(uuid) from public,anon;
grant execute on function public.canopy_simulate_billing_payment(uuid) to authenticated;

COMMIT;
