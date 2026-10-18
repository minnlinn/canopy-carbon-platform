-- Simulated SME-to-SME trading. Run after migrations 001–010. No real money or carbon credits.
begin;
do $$ begin
 if to_regclass('public.canopy_demo_entitlement_ledger') is null or to_regclass('public.canopy_demo_wallet_transactions') is null or to_regprocedure('public.canopy_is_account_active(uuid)') is null then raise exception 'Apply migrations 001-010 first.'; end if;
end $$;
alter table public.canopy_demo_wallet_transactions drop constraint if exists canopy_demo_wallet_transactions_transaction_type_check;
alter table public.canopy_demo_wallet_transactions add constraint canopy_demo_wallet_transactions_transaction_type_check check (transaction_type in ('top_up','purchase_reserve','purchase_refund','billing_payment','trade_reserve','trade_refund','trade_sale_proceeds'));
create table if not exists public.canopy_demo_trade_listings (
 id uuid primary key default gen_random_uuid(), seller_id uuid not null references auth.users(id), project_id uuid not null references public.canopy_demo_projects(id), quantity_tco2e numeric(14,2) not null check(quantity_tco2e>=0.01 and quantity_tco2e*100=trunc(quantity_tco2e*100)), unit_price_myr numeric(14,2) not null check(unit_price_myr>0), status text not null default 'active' check(status in ('active','cancelled','sold')), created_at timestamptz not null default now(), cancelled_at timestamptz, sold_at timestamptz
);
create table if not exists public.canopy_demo_trade_requests (
 id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.canopy_demo_trade_listings(id), buyer_id uuid not null references auth.users(id), seller_id uuid not null references auth.users(id), project_id uuid not null references public.canopy_demo_projects(id), quantity_tco2e numeric(14,2) not null check(quantity_tco2e>=0.01 and quantity_tco2e*100=trunc(quantity_tco2e*100)), unit_price_myr numeric(14,2) not null, credit_value_myr numeric(14,2) not null check (credit_value_myr >= 0), platform_fee_myr numeric(14,2) not null check (platform_fee_myr = round(credit_value_myr * 0.015, 2)), total_myr numeric(14,2) not null check (total_myr = credit_value_myr + platform_fee_myr), status text not null default 'pending_admin_review' check(status in ('pending_admin_review','approved_demo','rejected','cancelled')), idempotency_key text not null, review_note text not null default '', reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now(), unique(buyer_id,idempotency_key)
);
create unique index if not exists canopy_demo_trade_one_open_per_listing on public.canopy_demo_trade_requests(listing_id) where status in ('pending_admin_review','approved_demo');
create table if not exists public.canopy_demo_trade_audit (id uuid primary key default gen_random_uuid(), trade_id uuid not null references public.canopy_demo_trade_requests(id), actor_id uuid references auth.users(id), action text not null, note text not null, created_at timestamptz not null default now());
alter table public.canopy_demo_trade_listings enable row level security; alter table public.canopy_demo_trade_requests enable row level security; alter table public.canopy_demo_trade_audit enable row level security;
create policy canopy_trade_listing_read on public.canopy_demo_trade_listings for select to authenticated using (public.canopy_is_account_active(auth.uid()));
create policy canopy_trade_request_read on public.canopy_demo_trade_requests for select to authenticated using (buyer_id=auth.uid() or seller_id=auth.uid() or public.canopy_is_admin());
create policy canopy_trade_audit_read on public.canopy_demo_trade_audit for select to authenticated using (exists(select 1 from public.canopy_demo_trade_requests r where r.id=trade_id and (r.buyer_id=auth.uid() or r.seller_id=auth.uid() or public.canopy_is_admin())));
revoke all on public.canopy_demo_trade_listings,public.canopy_demo_trade_requests,public.canopy_demo_trade_audit from anon,authenticated; grant select on public.canopy_demo_trade_listings,public.canopy_demo_trade_requests,public.canopy_demo_trade_audit to authenticated;
create or replace function public.canopy_create_demo_trade_listing(p_project_id uuid,p_quantity numeric,p_unit_price numeric) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid(); held numeric; reserved numeric; row_data public.canopy_demo_trade_listings;
begin
 if actor is null or public.canopy_is_account_active(actor) is not true or not exists(select 1 from public.profiles where id=actor and role::text='sme' and verification_status::text='verified') then raise exception 'An active verified SME account is required.' using errcode='42501'; end if;
 if p_project_id is null or p_quantity is null or p_unit_price is null or p_quantity<.01 or p_quantity*100<>trunc(p_quantity*100) or p_unit_price<=0 or p_unit_price<>round(p_unit_price,2) then raise exception 'Project, quantity, and price must be valid.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||p_project_id::text,11));
 select coalesce(sum(delta_tco2e),0) into held from public.canopy_demo_entitlement_ledger where user_id=actor and project_id=p_project_id;
 select coalesce(sum(quantity_tco2e),0) into reserved from public.canopy_demo_trade_listings where seller_id=actor and project_id=p_project_id and status='active';
 if held-reserved<p_quantity then raise exception 'Insufficient uncommitted simulated holdings.' using errcode='22023'; end if;
 insert into public.canopy_demo_trade_listings(seller_id,project_id,quantity_tco2e,unit_price_myr) values(actor,p_project_id,p_quantity,p_unit_price) returning * into row_data; return to_jsonb(row_data);
end $$;
create or replace function public.canopy_cancel_demo_trade_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare row_data public.canopy_demo_trade_listings;
begin
  if p_listing_id is null then raise exception 'Listing is required.' using errcode='22023'; end if;
  if auth.uid() is null or public.canopy_is_account_active(auth.uid()) is not true
     or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='sme' and p.verification_status::text='verified') then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  select * into row_data from public.canopy_demo_trade_listings where id=p_listing_id and seller_id=auth.uid() for update;
  if not found or row_data.status<>'active' then raise exception 'Only an active listing you own can be cancelled.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||row_data.project_id::text,11));
  if exists(select 1 from public.canopy_demo_trade_requests r where r.listing_id=p_listing_id and r.status='pending_admin_review') then
    raise exception 'This listing has a pending trade review and cannot be cancelled.' using errcode='22023';
  end if;
  update public.canopy_demo_trade_listings set status='cancelled',cancelled_at=now() where id=p_listing_id returning * into row_data;
  return to_jsonb(row_data);
end $$;
create or replace function public.canopy_request_demo_trade(p_listing_id uuid,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid(); listing public.canopy_demo_trade_listings; total numeric; value numeric; fee numeric; balance numeric; row_data public.canopy_demo_trade_requests;
begin
 if actor is null or public.canopy_is_account_active(actor) is not true or not exists(select 1 from public.profiles where id=actor and role::text='sme' and verification_status::text='verified') then raise exception 'An active verified SME account is required.' using errcode='42501'; end if;
 if p_listing_id is null then raise exception 'Listing is required.' using errcode='22023'; end if;
 if length(trim(coalesce(p_idempotency_key,'')))<12 then raise exception 'A unique request key is required.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,1)); select * into row_data from public.canopy_demo_trade_requests where buyer_id=actor and idempotency_key=trim(p_idempotency_key) for update; if found then if row_data.listing_id<>p_listing_id then raise exception 'This request key belongs to a different listing.' using errcode='22023'; end if; return to_jsonb(row_data); end if; select * into listing from public.canopy_demo_trade_listings where id=p_listing_id for update; if not found or listing.status<>'active' or listing.seller_id=actor or public.canopy_is_account_active(listing.seller_id) is not true or not exists(select 1 from public.profiles where id=listing.seller_id and role::text='sme' and verification_status::text='verified') then raise exception 'This simulated listing is unavailable.' using errcode='22023'; end if;
 value:=round(listing.quantity_tco2e*listing.unit_price_myr,2); fee:=round(value*.015,2); total:=value+fee; select coalesce(sum(amount_myr),0) into balance from public.canopy_demo_wallet_transactions where user_id=actor; if balance<total then raise exception 'Insufficient Demo RM Wallet balance. Top up demo funds first.' using errcode='22023'; end if;
 insert into public.canopy_demo_trade_requests(listing_id,buyer_id,seller_id,project_id,quantity_tco2e,unit_price_myr,credit_value_myr,platform_fee_myr,total_myr,idempotency_key) values(listing.id,actor,listing.seller_id,listing.project_id,listing.quantity_tco2e,listing.unit_price_myr,value,fee,total,trim(p_idempotency_key)) returning * into row_data;
 insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,note) values(actor,'trade_reserve',-total,'trade-reserve:'||row_data.id::text,'Demo funds reserved for SME trade review; no real payment.'); insert into public.canopy_demo_trade_audit(trade_id,actor_id,action,note) values(row_data.id,actor,'submitted','Buyer submitted simulated trade.'); return to_jsonb(row_data);
end $$;
create or replace function public.canopy_admin_review_demo_trade(p_admin_id uuid,p_trade_id uuid,p_decision text,p_note text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare trade public.canopy_demo_trade_requests; listing public.canopy_demo_trade_listings; seller_held numeric; other_reserved numeric; reserve_row public.canopy_demo_wallet_transactions; first_wallet_id uuid; second_wallet_id uuid;
begin
 if auth.uid() is distinct from p_admin_id or public.canopy_is_admin() is not true then raise exception 'Administrator access required.' using errcode='42501'; end if; if p_decision not in ('approve','reject') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Provide an approval/rejection decision and audit note.' using errcode='22023'; end if;
 select * into trade from public.canopy_demo_trade_requests where id=p_trade_id for update; if not found or trade.status<>'pending_admin_review' then raise exception 'Only pending simulated trades can be reviewed.' using errcode='22023'; end if; if trade.buyer_id::text<trade.seller_id::text then first_wallet_id:=trade.buyer_id; second_wallet_id:=trade.seller_id; else first_wallet_id:=trade.seller_id; second_wallet_id:=trade.buyer_id; end if; perform pg_advisory_xact_lock(hashtextextended(first_wallet_id::text,1)); perform pg_advisory_xact_lock(hashtextextended(second_wallet_id::text,1)); select * into listing from public.canopy_demo_trade_listings where id=trade.listing_id for update; if not found then raise exception 'Trade listing no longer exists.' using errcode='P0002'; end if; perform pg_advisory_xact_lock(hashtextextended(trade.seller_id::text||trade.project_id::text,11)); select * into reserve_row from public.canopy_demo_wallet_transactions where user_id=trade.buyer_id and idempotency_key='trade-reserve:'||trade.id::text for update; if not found or reserve_row.transaction_type<>'trade_reserve' or reserve_row.amount_myr<>-trade.total_myr then raise exception 'The buyer reservation is missing or invalid.' using errcode='22023'; end if;
 if p_decision='approve' then
  if public.canopy_is_account_active(trade.buyer_id) is not true or public.canopy_is_account_active(trade.seller_id) is not true or not exists(select 1 from public.profiles where id=trade.buyer_id and role::text='sme' and verification_status::text='verified') or not exists(select 1 from public.profiles where id=trade.seller_id and role::text='sme' and verification_status::text='verified') then raise exception 'A party is no longer active; reject the trade to refund buyer funds.' using errcode='42501'; end if;
  select coalesce(sum(delta_tco2e),0) into seller_held from public.canopy_demo_entitlement_ledger where user_id=trade.seller_id and project_id=trade.project_id;
  select coalesce(sum(quantity_tco2e),0) into other_reserved from public.canopy_demo_trade_listings where seller_id=trade.seller_id and project_id=trade.project_id and status='active' and id<>listing.id;
  if listing.status<>'active' or seller_held<trade.quantity_tco2e or seller_held-trade.quantity_tco2e<other_reserved then raise exception 'Seller no longer has enough uncommitted simulated holdings; reject the trade.' using errcode='22023'; end if;
  insert into public.canopy_demo_entitlement_ledger(user_id,project_id,event_type,delta_tco2e,actor_id,note) values(trade.seller_id,trade.project_id,'transfer_out',-trade.quantity_tco2e,p_admin_id,'Simulated SME trade transfer out; no real credit transferred.');
  insert into public.canopy_demo_entitlement_ledger(user_id,project_id,event_type,delta_tco2e,actor_id,note) values(trade.buyer_id,trade.project_id,'transfer_in',trade.quantity_tco2e,p_admin_id,'Simulated SME trade transfer in; no real credit transferred.');
  insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,note) values(trade.seller_id,'trade_sale_proceeds',trade.credit_value_myr,'trade-proceeds:'||trade.id::text,'Simulated SME sale proceeds; no real money received.') on conflict(user_id,idempotency_key) do nothing;
  update public.canopy_demo_trade_listings set status='sold',sold_at=now() where id=listing.id; update public.canopy_demo_trade_requests set status='approved_demo',review_note=trim(p_note),reviewed_by=p_admin_id,reviewed_at=now() where id=trade.id returning * into trade;
 else
  if exists(select 1 from public.canopy_demo_wallet_transactions where user_id=trade.buyer_id and idempotency_key='trade-refund:'||trade.id::text) then raise exception 'This trade reservation has already been refunded.' using errcode='22023'; end if;
  insert into public.canopy_demo_wallet_transactions(user_id,transaction_type,amount_myr,idempotency_key,note) values(trade.buyer_id,'trade_refund',trade.total_myr,'trade-refund:'||trade.id::text,'Demo trade reservation returned after Admin rejection; no real money refunded.');
  update public.canopy_demo_trade_requests set status='rejected',review_note=trim(p_note),reviewed_by=p_admin_id,reviewed_at=now() where id=trade.id returning * into trade;
 end if;
 insert into public.canopy_demo_trade_audit(trade_id,actor_id,action,note) values(trade.id,p_admin_id,p_decision,trim(p_note)); return to_jsonb(trade);
end $$;
revoke all on function public.canopy_create_demo_trade_listing(uuid,numeric,numeric),public.canopy_cancel_demo_trade_listing(uuid),public.canopy_request_demo_trade(uuid,text),public.canopy_admin_review_demo_trade(uuid,uuid,text,text) from public,anon;
grant execute on function public.canopy_create_demo_trade_listing(uuid,numeric,numeric),public.canopy_cancel_demo_trade_listing(uuid),public.canopy_request_demo_trade(uuid,text),public.canopy_admin_review_demo_trade(uuid,uuid,text,text) to authenticated;
commit;
