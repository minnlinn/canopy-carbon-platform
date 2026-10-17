-- Canopy migration 005, reviewed draft. Run only once after checking it against your own project.
BEGIN;

-- Canopy account-access controls. Run only after migrations 001–004.
-- This is additive: it retains profiles, applications, transactions and existing audit records.

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.canopy_account_applications') is null
     or to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_billing_orders') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'Apply Canopy migrations 001–004 before account access controls.';
  end if;
end;
$$;

-- Preflight: verify expected prior schema before applying any changes.
do $$
begin
  if to_regtype('public.verification_status') is null then
    raise exception 'Expected public.verification_status enum is missing. Do not run until the existing profile schema is checked.';
  end if;
  if not exists (
    select 1 from pg_enum e
    where e.enumtypid = 'public.verification_status'::regtype and e.enumlabel = 'verified'
  ) then
    raise exception 'Expected verified value is missing from public.verification_status.';
  end if;
  if to_regclass('public.canopy_partner_client_consents') is null
     or to_regclass('public.canopy_subscriptions') is null
     or to_regclass('public.canopy_report_requests') is null
     or to_regclass('public.canopy_transaction_charges') is null
     or to_regclass('public.canopy_demo_entitlement_ledger') is null
     or to_regclass('public.canopy_account_review_audit') is null then
    raise exception 'Missing prerequisite Canopy tables; confirm migrations 001-004 completed.';
  end if;
end;
$$;

create table if not exists public.canopy_account_access_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_status text not null default 'active' check (access_status in ('active','suspended')),
  changed_by uuid references auth.users(id),
  reason text,
  changed_at timestamptz not null default now()
);

create table if not exists public.canopy_account_access_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  previous_status text not null check (previous_status in ('pending','verified','rejected','suspended')),
  new_status text not null check (new_status in ('pending','verified','rejected','suspended')),
  reason text not null check (length(trim(reason)) >= 3),
  created_at timestamptz not null default now()
);

alter table public.canopy_account_access_controls enable row level security;
alter table public.canopy_account_access_audit enable row level security;
drop policy if exists canopy_account_access_audit_admin_read on public.canopy_account_access_audit;
create policy canopy_account_access_audit_admin_read on public.canopy_account_access_audit
  for select to authenticated using (public.is_admin());
revoke all on public.canopy_account_access_controls, public.canopy_account_access_audit from anon, authenticated;
grant select on public.canopy_account_access_audit to authenticated;

create or replace function public.canopy_effective_account_status(p_user_id uuid)
returns text language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select case
    when exists(select 1 from public.canopy_account_access_controls c where c.user_id=p_user_id and c.access_status='suspended') then 'suspended'
    when exists(select 1 from public.canopy_account_applications a where a.user_id=p_user_id and a.review_status='rejected') then 'rejected'
    when exists(select 1 from public.profiles p where p.id=p_user_id and p.verification_status::text='verified') then 'verified'
    else 'pending'
  end;
$$;

create or replace function public.canopy_is_account_active(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists(select 1 from public.profiles p where p.id=p_user_id and p.role::text='admin')
    or public.canopy_effective_account_status(p_user_id)='verified';
$$;

create or replace function public.canopy_current_account_status()
returns text language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select public.canopy_effective_account_status(auth.uid()); $$;

create or replace function public.canopy_admin_account_statuses()
returns table(user_id uuid, effective_status text)
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select p.id, public.canopy_effective_account_status(p.id)
  from public.profiles p
  where auth.role()='service_role' and p.role::text in ('sme','partner');
$$;

create or replace function public.canopy_admin_change_account_status(
  p_admin_id uuid, p_user_id uuid, p_action text, p_reason text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare target public.profiles; previous_status text; next_status text; account_type text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service-only administrator workflow.' using errcode='42501'; end if;
  if p_admin_id=p_user_id or not exists(select 1 from public.profiles p where p.id=p_admin_id and p.role::text='admin') then
    raise exception 'A different administrator account is required.' using errcode='42501';
  end if;
  if p_action not in ('approve','reject','suspend','reactivate') or length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'A permitted action and an audit reason are required.' using errcode='22023';
  end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found or target.role::text not in ('sme','partner') then raise exception 'Only SME and Partner accounts can be changed.' using errcode='22023'; end if;
  previous_status:=public.canopy_effective_account_status(p_user_id);
  account_type:=target.role::text;
  if p_action='approve' and previous_status='pending' then
    update public.profiles set verification_status='verified'::public.verification_status,review_note=trim(p_reason),updated_at=now() where id=p_user_id;
    update public.canopy_account_applications set review_status='approved',reviewed_by=p_admin_id,reviewed_at=now(),review_note=trim(p_reason) where user_id=p_user_id;
    insert into public.canopy_account_review_audit(user_id,admin_id,account_type,previous_status,decision,note) values(p_user_id,p_admin_id,account_type,'pending','approved',trim(p_reason));
    next_status:='verified';
  elsif p_action='reject' and previous_status='pending' then
    update public.profiles set review_note=trim(p_reason),updated_at=now() where id=p_user_id;
    update public.canopy_account_applications set review_status='rejected',reviewed_by=p_admin_id,reviewed_at=now(),review_note=trim(p_reason) where user_id=p_user_id;
    insert into public.canopy_account_review_audit(user_id,admin_id,account_type,previous_status,decision,note) values(p_user_id,p_admin_id,account_type,'pending','rejected',trim(p_reason));
    next_status:='rejected';
  elsif p_action='suspend' and previous_status='verified' then
    insert into public.canopy_account_access_controls(user_id,access_status,changed_by,reason,changed_at) values(p_user_id,'suspended',p_admin_id,trim(p_reason),now())
      on conflict(user_id) do update set access_status='suspended',changed_by=excluded.changed_by,reason=excluded.reason,changed_at=excluded.changed_at;
    next_status:='suspended';
  elsif p_action='reactivate' and previous_status='suspended' then
    insert into public.canopy_account_access_controls(user_id,access_status,changed_by,reason,changed_at) values(p_user_id,'active',p_admin_id,trim(p_reason),now())
      on conflict(user_id) do update set access_status='active',changed_by=excluded.changed_by,reason=excluded.reason,changed_at=excluded.changed_at;
    next_status:=case when target.verification_status::text='verified' then 'verified' else 'pending' end;
  else
    raise exception 'This account cannot be changed from its current status.' using errcode='22023';
  end if;
  insert into public.canopy_account_access_audit(user_id,admin_id,previous_status,new_status,reason) values(p_user_id,p_admin_id,previous_status,next_status,trim(p_reason));
  return jsonb_build_object('user_id',p_user_id,'previous_status',previous_status,'effective_status',next_status);
end;
$$;

create or replace function public.canopy_has_subscription(p_plan text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select public.canopy_is_account_active(auth.uid()) and exists(
    select 1 from public.canopy_subscriptions s
    join public.profiles p on p.id=s.user_id
    where s.user_id=auth.uid() and s.plan=p_plan and s.status in ('active','active_demo')
      and (s.renewal_at is null or s.renewal_at>now())
      and ((p_plan='premium' and p.role::text='sme') or (p_plan='partner' and p.role::text='partner'))
  );
$$;

create or replace function public.canopy_block_inactive_account_action()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_id uuid;
begin
  actor_id:=case tg_table_name when 'carbon_requests' then new.requester_id else new.user_id end;
  if actor_id is not null and not public.canopy_is_account_active(actor_id) and not public.canopy_is_admin() then
    raise exception 'This account is not verified or is suspended.' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists canopy_block_inactive_carbon_request on public.carbon_requests;
create trigger canopy_block_inactive_carbon_request before insert or update on public.carbon_requests
  for each row execute function public.canopy_block_inactive_account_action();
drop trigger if exists canopy_block_inactive_demo_purchase on public.canopy_demo_purchase_requests;
create trigger canopy_block_inactive_demo_purchase before insert or update on public.canopy_demo_purchase_requests
  for each row execute function public.canopy_block_inactive_account_action();
drop trigger if exists canopy_block_inactive_billing_order on public.canopy_billing_orders;
create trigger canopy_block_inactive_billing_order before insert or update on public.canopy_billing_orders
  for each row execute function public.canopy_block_inactive_account_action();

create or replace function public.canopy_has_subscription_for(p_user_id uuid,p_plan text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select public.canopy_is_account_active(p_user_id) and exists(
    select 1 from public.canopy_subscriptions s
    where s.user_id=p_user_id and s.plan=p_plan and s.status in ('active','active_demo')
      and (s.renewal_at is null or s.renewal_at>now())
      and exists (select 1 from public.profiles p where p.id=p_user_id
        and ((p_plan='premium' and p.role::text='sme') or (p_plan='partner' and p.role::text='partner')))
  );
$$;

create or replace function public.canopy_report_data(p_report_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare report_row public.canopy_report_requests; profile_json jsonb; holdings_json jsonb; requests_json jsonb;
begin
  if not public.canopy_is_account_active(auth.uid()) then raise exception 'An active verified account is required.' using errcode='42501'; end if;
  select * into report_row from public.canopy_report_requests where id=p_report_id and user_id=auth.uid();
  if not found then raise exception 'Report not found.' using errcode='P0002'; end if;
  if report_row.status not in ('ready','ready_demo') then raise exception 'Report is not authorized for download.' using errcode='42501'; end if;
  select jsonb_build_object('company_name',p.company_name,'registration_number',p.registration_number,'contact_name',p.contact_name,'sector',p.sector) into profile_json from public.profiles p where p.id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb) into holdings_json from public.holdings h left join public.projects pr on pr.id=h.project_id where h.owner_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb) into requests_json from public.carbon_requests r left join public.projects pr on pr.id=r.project_id where (r.requester_id=auth.uid() or r.recipient_id=auth.uid()) and r.created_at>=report_row.period_start::timestamptz and r.created_at<(report_row.period_end+1)::timestamptz;
  return jsonb_build_object('report',to_jsonb(report_row),'company',coalesce(profile_json,'{}'::jsonb),'holdings',coalesce(holdings_json,'[]'::jsonb),'transactions',coalesce(requests_json,'[]'::jsonb),'impact_claims_supported',false,'data_note','Only stored Canopy records are included; no emissions or environmental impact estimate is inferred.');
end;
$$;

create or replace function public.canopy_create_billing_order(
  p_order_type text, p_idempotency_key text, p_period_start date default current_date,
  p_period_end date default (current_date + interval '1 month')::date
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare actor uuid:=auth.uid(); actor_role text; actor_status text; fixed_price numeric(12,2); order_row public.canopy_billing_orders;
begin
  if actor is null or not public.canopy_is_account_active(actor) then raise exception 'An active verified account is required.' using errcode='42501'; end if;
  if length(trim(coalesce(p_idempotency_key,'')))<12 or p_period_end<p_period_start then raise exception 'A valid checkout key and billing period are required.' using errcode='22023'; end if;
  select p.role::text,p.verification_status::text into actor_role,actor_status from public.profiles p where p.id=actor;
  if p_order_type='premium_subscription' and actor_role='sme' and actor_status='verified' then fixed_price:=250;
  elsif p_order_type='partner_subscription' and actor_role='partner' and actor_status='verified' then fixed_price:=500;
  elsif p_order_type='esg_report' and actor_role='sme' and actor_status='verified' then fixed_price:=500;
  else raise exception 'This account cannot purchase the requested item.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_order_type||p_period_start::text||p_period_end::text,0));
  select * into order_row from public.canopy_billing_orders where user_id=actor and order_type=p_order_type and payment_status='pending' and (p_order_type<>'esg_report' or (period_start=p_period_start and period_end=p_period_end)) order by created_at desc limit 1;
  if found then return to_jsonb(order_row); end if;
  insert into public.canopy_billing_orders(user_id,order_type,amount_myr,idempotency_key,period_start,period_end) values(actor,p_order_type,fixed_price,trim(p_idempotency_key),p_period_start,p_period_end) on conflict(user_id,idempotency_key) do nothing;
  select * into order_row from public.canopy_billing_orders where user_id=actor and idempotency_key=trim(p_idempotency_key);
  if p_order_type='esg_report' then insert into public.canopy_report_requests(user_id,billing_order_id,period_start,period_end) values(actor,order_row.id,p_period_start,p_period_end) on conflict(billing_order_id) do nothing; end if;
  return to_jsonb(order_row);
end;
$$;

create or replace function public.canopy_block_inactive_partner_consent()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.revoked_at is null and not public.canopy_is_admin() and (not public.canopy_is_account_active(new.sme_id) or not public.canopy_is_account_active(new.partner_id)) then
    raise exception 'Both accounts must be active and verified before Partner consent can be granted.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists canopy_block_inactive_partner_consent on public.canopy_partner_client_consents;
create trigger canopy_block_inactive_partner_consent before insert or update on public.canopy_partner_client_consents
  for each row execute function public.canopy_block_inactive_partner_consent();

alter table public.holdings enable row level security;
alter table public.carbon_requests enable row level security;
drop policy if exists canopy_active_holdings_gate on public.holdings;
drop policy if exists canopy_active_carbon_requests_gate on public.carbon_requests;
drop policy if exists canopy_active_billing_gate on public.canopy_billing_orders;
drop policy if exists canopy_active_reports_gate on public.canopy_report_requests;
drop policy if exists canopy_active_charges_gate on public.canopy_transaction_charges;
drop policy if exists canopy_active_demo_purchases_gate on public.canopy_demo_purchase_requests;
drop policy if exists canopy_active_demo_ledger_gate on public.canopy_demo_entitlement_ledger;
create policy canopy_active_holdings_gate on public.holdings as restrictive for select to authenticated using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));
create policy canopy_active_carbon_requests_gate on public.carbon_requests as restrictive for all to authenticated using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid())) with check (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));
create policy canopy_active_billing_gate on public.canopy_billing_orders as restrictive for select to authenticated using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));
create policy canopy_active_reports_gate on public.canopy_report_requests as restrictive for select to authenticated using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));
create policy canopy_active_charges_gate on public.canopy_transaction_charges as restrictive for select to authenticated using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));
create policy canopy_active_demo_purchases_gate on public.canopy_demo_purchase_requests as restrictive for select to authenticated using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));
create policy canopy_active_demo_ledger_gate on public.canopy_demo_entitlement_ledger as restrictive for select to authenticated using (public.canopy_is_admin() or public.canopy_is_account_active(auth.uid()));

-- Tighten the existing partner helper used by holdings/requests RLS.
-- Both parties must remain active/verified, and the SME must have granted consent.
create or replace function public.canopy_partner_can_access_sme(p_sme_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select public.canopy_is_account_active(auth.uid())
     and public.canopy_is_account_active(p_sme_id)
     and public.canopy_has_subscription('partner')
     and exists (
       select 1 from public.canopy_partner_client_consents c
       join public.profiles p on p.id=c.partner_id
       where c.partner_id=auth.uid() and c.sme_id=p_sme_id
         and c.granted_at is not null and c.revoked_at is null
         and p.role::text='partner'
     );
$$;

-- A session may remain authenticated after suspension, but protected database
-- operations are rejected immediately by the account status and RLS checks.
-- Supabase Auth refresh-token/session revocation must also be handled by the Edge Function.

revoke all on function public.canopy_admin_change_account_status(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.canopy_admin_change_account_status(uuid,uuid,text,text) to service_role;
revoke all on function public.canopy_admin_account_statuses() from public,anon,authenticated;
grant execute on function public.canopy_admin_account_statuses() to service_role;
revoke all on function public.canopy_effective_account_status(uuid) from public,anon;
revoke all on function public.canopy_is_account_active(uuid) from public,anon;
revoke all on function public.canopy_current_account_status() from public,anon;
grant execute on function public.canopy_is_account_active(uuid), public.canopy_current_account_status() to authenticated;

COMMIT;
