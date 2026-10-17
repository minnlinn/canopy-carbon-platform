do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.projects') is null
     or to_regclass('public.holdings') is null
     or to_regclass('public.carbon_requests') is null then
    raise exception 'Canopy revenue migration prerequisites missing: profiles, projects, holdings, and carbon_requests are required.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='price_myr')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='carbon_requests' and column_name='id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='carbon_requests' and column_name='project_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='carbon_requests' and column_name='request_type')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='carbon_requests' and column_name='quantity_tco2e')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='carbon_requests' and column_name='status')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='carbon_requests' and column_name='created_at')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='listing_status')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='company_name')
      or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='verification_status') then
    raise exception 'Canopy revenue migration prerequisites do not match the app data contract. Review public schema columns before applying.';
  end if;
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id' and data_type<>'uuid')
      or exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='id' and data_type<>'uuid')
      or exists(select 1 from information_schema.columns where table_schema='public' and table_name='carbon_requests' and column_name in ('id','project_id') and data_type<>'uuid') then
     raise exception 'Canopy revenue migration expects UUID profile, project and request identifiers. Review the live schema before applying.';
    end if;
    if not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='canopy_prepare_profile_before_insert' and not tgisinternal)
       or not exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='canopy_protect_profile_security_fields_before_update' and not tgisinternal) then
      raise exception 'Apply the Canopy account-notification migration first; profile role and verification protection triggers are required.';
    end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='projects' and c.relrowsecurity) then
    raise exception 'Row Level Security must already be enabled on public.projects. Review existing policies before applying the Canopy release gate.';
  end if;
end;
$$;

create table if not exists public.canopy_billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_type text not null check (order_type in ('premium_subscription','partner_subscription','esg_report')),
  amount_myr numeric(12,2) not null check (amount_myr >= 0),
  currency text not null default 'MYR' check (currency = 'MYR'),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','sandbox_paid','failed','cancelled','overdue')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  payment_mode text not null default 'sandbox' check (payment_mode in ('sandbox','provider')),
  idempotency_key text not null,
  payment_reference text,
  period_start date,
  period_end date,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (user_id, idempotency_key)
);

create table if not exists public.canopy_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('premium','partner')),
  status text not null check (status in ('active','active_demo','cancelled','expired')),
  monthly_price_myr numeric(12,2) not null,
  billing_order_id uuid references public.canopy_billing_orders(id),
  started_at timestamptz not null default now(),
  renewal_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, plan)
);

create table if not exists public.canopy_report_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  billing_order_id uuid not null unique references public.canopy_billing_orders(id),
  period_start date not null,
  period_end date not null,
  status text not null default 'pending' check (status in ('pending','ready','ready_demo','failed')),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.canopy_transaction_charges (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  user_id uuid,
  project_id uuid,
  developer_id uuid,
  transaction_type text not null,
  quantity_tco2e numeric(14,3) not null default 0,
  transaction_value_myr numeric(14,2),
  sme_fee_rate numeric(6,5) not null default 0.015,
  sme_fee_myr numeric(14,2),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','overdue','needs_review')),
  approval_status text not null default 'completed',
  approved_at timestamptz,
  completed_at timestamptz not null default now(),
  payment_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.canopy_developer_commissions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  developer_id uuid not null,
  project_id uuid,
  quantity_tco2e numeric(14,3) not null default 0,
  transaction_value_myr numeric(14,2) not null,
  commission_rate numeric(6,5) not null default 0.015,
  commission_myr numeric(14,2) not null,
  invoice_reference text not null unique,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','overdue')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  payment_reference text
);

create table if not exists public.canopy_project_developers (
  project_id uuid primary key,
  developer_id uuid not null references auth.users(id),
  assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now()
);

create table if not exists public.canopy_billing_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  target_type text not null,
  target_id uuid not null,
  previous_status text,
  new_status text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.canopy_reconciliation_alerts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  detail text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

create table if not exists public.canopy_partner_codes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (partner_id)
);

create table if not exists public.canopy_partner_referrals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  sme_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  unique (sme_id)
);

create table if not exists public.canopy_partner_client_consents (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references auth.users(id) on delete cascade,
  sme_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (partner_id, sme_id)
);

create table if not exists public.canopy_referral_settings (
  singleton boolean primary key default true check (singleton),
  reward_type text not null default 'disabled' check (reward_type in ('disabled','percentage','fixed_myr')),
  reward_percent numeric(7,5) not null default 0 check (reward_percent >= 0 and reward_percent <= 1),
  reward_fixed_myr numeric(12,2) not null default 0 check (reward_fixed_myr >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.canopy_referral_settings(singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.canopy_project_release_rules (
  project_id uuid primary key,
  premium_available_at timestamptz not null default now(),
  free_available_at timestamptz not null default (now() + interval '48 hours'),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check (free_available_at >= premium_available_at)
);

create or replace function public.canopy_is_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin');
$$;

create or replace function public.canopy_has_subscription(p_plan text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.canopy_subscriptions s
    where s.user_id = auth.uid() and s.plan = p_plan
      and s.status in ('active','active_demo')
      and (s.renewal_at is null or s.renewal_at > now())
      and (p_plan<>'partner' or exists(select 1 from public.profiles p where p.id=auth.uid()
        and p.role::text='partner' and p.verification_status::text='verified'))
  );
$$;

alter table public.canopy_billing_orders enable row level security;
alter table public.canopy_subscriptions enable row level security;
alter table public.canopy_report_requests enable row level security;
alter table public.canopy_transaction_charges enable row level security;
alter table public.canopy_developer_commissions enable row level security;
alter table public.canopy_billing_audit enable row level security;
alter table public.canopy_reconciliation_alerts enable row level security;
alter table public.canopy_partner_codes enable row level security;
alter table public.canopy_partner_referrals enable row level security;
alter table public.canopy_partner_client_consents enable row level security;
alter table public.canopy_referral_settings enable row level security;
alter table public.canopy_project_release_rules enable row level security;
alter table public.canopy_project_developers enable row level security;

create policy canopy_billing_orders_read on public.canopy_billing_orders for select to authenticated using (user_id = auth.uid() or public.canopy_is_admin());
create policy canopy_subscriptions_read on public.canopy_subscriptions for select to authenticated using (user_id = auth.uid() or public.canopy_is_admin());
create policy canopy_reports_read on public.canopy_report_requests for select to authenticated using (user_id = auth.uid() or public.canopy_is_admin());
create policy canopy_charges_read on public.canopy_transaction_charges for select to authenticated using (user_id = auth.uid() or developer_id = auth.uid() or public.canopy_is_admin());
create policy canopy_commissions_read on public.canopy_developer_commissions for select to authenticated using (developer_id = auth.uid() or public.canopy_is_admin());
create policy canopy_billing_audit_admin_read on public.canopy_billing_audit for select to authenticated using (public.canopy_is_admin());
create policy canopy_reconciliation_admin_read on public.canopy_reconciliation_alerts for select to authenticated using (public.canopy_is_admin());
create policy canopy_partner_codes_read on public.canopy_partner_codes for select to authenticated using (partner_id = auth.uid() or public.canopy_is_admin());
create policy canopy_referrals_read on public.canopy_partner_referrals for select to authenticated using (partner_id = auth.uid() or sme_id = auth.uid() or public.canopy_is_admin());
create policy canopy_consents_read on public.canopy_partner_client_consents for select to authenticated using (partner_id = auth.uid() or sme_id = auth.uid() or public.canopy_is_admin());
create policy canopy_referral_settings_read on public.canopy_referral_settings for select to authenticated using (true);
create policy canopy_release_admin_read on public.canopy_project_release_rules for select to authenticated using (public.canopy_is_admin());
create policy canopy_project_developers_read on public.canopy_project_developers for select to authenticated using (developer_id=auth.uid() or public.canopy_is_admin());

grant select on public.canopy_billing_orders, public.canopy_subscriptions, public.canopy_report_requests,
  public.canopy_transaction_charges, public.canopy_developer_commissions, public.canopy_billing_audit,
  public.canopy_reconciliation_alerts, public.canopy_partner_codes, public.canopy_partner_referrals,
  public.canopy_partner_client_consents, public.canopy_referral_settings, public.canopy_project_release_rules,
  public.canopy_project_developers
  to authenticated;
revoke insert, update, delete on public.canopy_billing_orders, public.canopy_subscriptions, public.canopy_report_requests,
  public.canopy_transaction_charges, public.canopy_developer_commissions, public.canopy_billing_audit,
  public.canopy_reconciliation_alerts, public.canopy_partner_codes, public.canopy_partner_referrals,
  public.canopy_partner_client_consents, public.canopy_referral_settings, public.canopy_project_release_rules,
  public.canopy_project_developers
  from anon, authenticated;

create or replace function public.canopy_create_billing_order(
  p_order_type text,
  p_idempotency_key text,
  p_period_start date default current_date,
  p_period_end date default (current_date + interval '1 month')::date
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  actor_status text;
  fixed_price numeric(12,2);
  order_row public.canopy_billing_orders;
begin
  if actor is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 12 then raise exception 'A unique checkout key is required.' using errcode = '22023'; end if;
  select p.role::text,p.verification_status::text into actor_role,actor_status from public.profiles p where p.id = actor;
  if p_order_type = 'premium_subscription' and actor_role = 'sme' then fixed_price := 250;
  elsif p_order_type = 'partner_subscription' and actor_role = 'partner' and actor_status='verified' then fixed_price := 500;
  elsif p_order_type = 'esg_report' and actor_role = 'sme' then fixed_price := 500;
  else raise exception 'This account cannot purchase the requested item.' using errcode = '42501'; end if;
  if p_period_end < p_period_start then raise exception 'Invalid billing/reporting period.' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_order_type || p_period_start::text || p_period_end::text,0));
  select * into order_row from public.canopy_billing_orders
  where user_id=actor and order_type=p_order_type and payment_status='pending'
    and (p_order_type<>'esg_report' or (period_start=p_period_start and period_end=p_period_end))
  order by created_at desc limit 1;
  if found then return to_jsonb(order_row); end if;

  insert into public.canopy_billing_orders(user_id,order_type,amount_myr,idempotency_key,period_start,period_end)
  values (actor,p_order_type,fixed_price,trim(p_idempotency_key),p_period_start,p_period_end)
  on conflict(user_id,idempotency_key) do nothing;
  select * into order_row from public.canopy_billing_orders
  where user_id = actor and idempotency_key = trim(p_idempotency_key);
  if p_order_type = 'esg_report' then
    insert into public.canopy_report_requests(user_id,billing_order_id,period_start,period_end)
    values (actor,order_row.id,p_period_start,p_period_end) on conflict(billing_order_id) do nothing;
  end if;
  return to_jsonb(order_row);
end;
$$;

create or replace function public.canopy_simulate_billing_payment(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor uuid := auth.uid();
  order_row public.canopy_billing_orders;
  plan_name text;
begin
  select * into order_row from public.canopy_billing_orders where id = p_order_id and user_id = actor for update;
  if not found then raise exception 'Checkout not found.' using errcode = 'P0002'; end if;
  if order_row.payment_mode <> 'sandbox' then raise exception 'Sandbox checkout is disabled for this order.' using errcode = '42501'; end if;
  if order_row.payment_status='sandbox_paid' then return to_jsonb(order_row); end if;
  if order_row.payment_status<>'pending' then raise exception 'Checkout is no longer payable.' using errcode = '22023'; end if;
  update public.canopy_billing_orders set payment_status='sandbox_paid', approval_status='approved',
    payment_reference='DEMO-' || upper(substr(replace(p_order_id::text,'-',''),1,12)), paid_at=now()
  where id=p_order_id returning * into order_row;
  if order_row.order_type in ('premium_subscription','partner_subscription') then
    plan_name := case when order_row.order_type='premium_subscription' then 'premium' else 'partner' end;
    insert into public.canopy_subscriptions(user_id,plan,status,monthly_price_myr,billing_order_id,started_at,renewal_at,cancelled_at)
    values (actor,plan_name,'active_demo',order_row.amount_myr,order_row.id,now(),now()+interval '1 month',null)
    on conflict(user_id,plan) do update set status='active_demo',monthly_price_myr=excluded.monthly_price_myr,
      billing_order_id=excluded.billing_order_id,started_at=now(),renewal_at=now()+interval '1 month',cancelled_at=null;
  elsif order_row.order_type='esg_report' then
    update public.canopy_report_requests set status='ready_demo' where billing_order_id=order_row.id and user_id=actor;
  end if;
  return to_jsonb(order_row);
end;
$$;

create or replace function public.canopy_cancel_subscription(p_plan text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare subscription_row public.canopy_subscriptions; previous_status text;
begin
  if p_plan not in ('premium','partner') then raise exception 'Invalid subscription plan.' using errcode='22023'; end if;
  select status into previous_status from public.canopy_subscriptions
    where user_id=auth.uid() and plan=p_plan and status in ('active','active_demo') for update;
  if not found then raise exception 'No active subscription found.' using errcode='P0002'; end if;
  update public.canopy_subscriptions set status='cancelled',cancelled_at=now()
    where user_id=auth.uid() and plan=p_plan returning * into subscription_row;
  insert into public.canopy_billing_audit(actor_id,target_type,target_id,previous_status,new_status,note)
    values(auth.uid(),'subscription',subscription_row.id,previous_status,'cancelled','User cancelled subscription.');
  return to_jsonb(subscription_row);
end;
$$;

create or replace function public.canopy_admin_set_billing_status(p_order_id uuid,p_status text,p_reference text,p_note text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare order_row public.canopy_billing_orders; previous text;
begin
  if not public.canopy_is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_status not in ('pending','paid','overdue') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Valid status and audit note are required.' using errcode='22023'; end if;
  select payment_status into previous from public.canopy_billing_orders where id=p_order_id for update;
  if not found then raise exception 'Billing order not found.' using errcode='P0002'; end if;
  update public.canopy_billing_orders set payment_status=p_status,payment_reference=nullif(trim(p_reference),''),paid_at=case when p_status='paid' then now() else null end
    where id=p_order_id returning * into order_row;
  if order_row.payment_mode<>'provider' then
    update public.canopy_billing_orders set payment_status=previous,payment_reference=null where id=p_order_id returning * into order_row;
    raise exception 'Demo orders cannot be recorded as collected cash.' using errcode='22023';
  end if;
  insert into public.canopy_billing_audit(actor_id,target_type,target_id,previous_status,new_status,note)
    values(auth.uid(),'billing_order',p_order_id,previous,p_status,trim(p_note));
  if order_row.order_type in ('premium_subscription','partner_subscription') then
    if p_status='paid' then
      insert into public.canopy_subscriptions(user_id,plan,status,monthly_price_myr,billing_order_id,started_at,renewal_at,cancelled_at)
      values(order_row.user_id,case when order_row.order_type='premium_subscription' then 'premium' else 'partner' end,
        'active',order_row.amount_myr,order_row.id,now(),now()+interval '1 month',null)
      on conflict(user_id,plan) do update set status='active',monthly_price_myr=excluded.monthly_price_myr,
        billing_order_id=excluded.billing_order_id,started_at=now(),renewal_at=now()+interval '1 month',cancelled_at=null;
    else
      update public.canopy_subscriptions set status='cancelled',cancelled_at=now()
      where billing_order_id=order_row.id;
    end if;
  elsif order_row.order_type='esg_report' then
    update public.canopy_report_requests set status=case when p_status='paid' then 'ready' else 'pending' end
      where billing_order_id=order_row.id;
  end if;
  return to_jsonb(order_row);
end;
$$;

create or replace function public.canopy_admin_set_developer_status(p_commission_id uuid,p_status text,p_reference text,p_note text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare commission_row public.canopy_developer_commissions; previous text;
begin
  if not public.canopy_is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_status not in ('pending','paid','overdue') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Valid status and audit note are required.' using errcode='22023'; end if;
  select payment_status into previous from public.canopy_developer_commissions where id=p_commission_id for update;
  if not found then raise exception 'Developer invoice not found.' using errcode='P0002'; end if;
  update public.canopy_developer_commissions set payment_status=p_status,payment_reference=nullif(trim(p_reference),''),paid_at=case when p_status='paid' then now() else null end
    where id=p_commission_id returning * into commission_row;
  insert into public.canopy_billing_audit(actor_id,target_type,target_id,previous_status,new_status,note)
    values(auth.uid(),'developer_commission',p_commission_id,previous,p_status,trim(p_note));
  return to_jsonb(commission_row);
end;
$$;

create or replace function public.canopy_admin_set_transaction_fee_status(p_charge_id uuid,p_status text,p_reference text,p_note text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare charge_row public.canopy_transaction_charges; previous text;
begin
  if not public.canopy_is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_status not in ('pending','paid','overdue','needs_review') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Valid status and audit note are required.' using errcode='22023'; end if;
  select payment_status into previous from public.canopy_transaction_charges where id=p_charge_id for update;
  if not found then raise exception 'Transaction charge not found.' using errcode='P0002'; end if;
  update public.canopy_transaction_charges set payment_status=p_status,payment_reference=nullif(trim(p_reference),''),paid_at=case when p_status='paid' then now() else null end
    where id=p_charge_id returning * into charge_row;
  insert into public.canopy_billing_audit(actor_id,target_type,target_id,previous_status,new_status,note)
    values(auth.uid(),'transaction_fee',p_charge_id,previous,p_status,trim(p_note));
  return to_jsonb(charge_row);
end;
$$;

create or replace function public.canopy_admin_set_referral_reward(p_type text,p_percent numeric,p_fixed_myr numeric)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare setting_row public.canopy_referral_settings;
begin
  if not public.canopy_is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_type not in ('disabled','percentage','fixed_myr') or p_percent<0 or p_percent>1 or p_fixed_myr<0 then raise exception 'Invalid referral reward configuration.' using errcode='22023'; end if;
  update public.canopy_referral_settings set reward_type=p_type,reward_percent=p_percent,reward_fixed_myr=p_fixed_myr,updated_by=auth.uid(),updated_at=now()
    where singleton=true returning * into setting_row;
  insert into public.canopy_billing_audit(actor_id,target_type,target_id,new_status,note)
    values(auth.uid(),'referral_reward',gen_random_uuid(),p_type,'Referral reward settings updated.');
  return to_jsonb(setting_row);
end;
$$;

create or replace function public.canopy_create_partner_code()
returns text language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare code_value text; actor_role text;
begin
  select p.role::text into actor_role from public.profiles p where p.id=auth.uid();
  if actor_role<>'partner' or not public.canopy_has_subscription('partner') then raise exception 'An active Partner Portal subscription is required.' using errcode='42501'; end if;
  select code into code_value from public.canopy_partner_codes where partner_id=auth.uid() and active=true;
  if code_value is null then
    code_value := upper(substr(md5(auth.uid()::text || clock_timestamp()::text || random()::text),1,10));
    insert into public.canopy_partner_codes(partner_id,code) values(auth.uid(),code_value);
  end if;
  return code_value;
end;
$$;

create or replace function public.canopy_claim_partner_referral(p_code text default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare actor_role text; code_value text; partner uuid; referral public.canopy_partner_referrals;
begin
  select p.role::text into actor_role from public.profiles p where p.id=auth.uid();
  if actor_role<>'sme' then raise exception 'Only SME accounts may claim a referral.' using errcode='42501'; end if;
  code_value := upper(coalesce(nullif(trim(p_code),''),auth.jwt()->'user_metadata'->>'referral_code',''));
  if code_value='' then return '{}'::jsonb; end if;
  select c.partner_id into partner from public.canopy_partner_codes c
  where c.code=code_value and c.active=true and public.canopy_has_subscription_for(c.partner_id,'partner');
  if partner is null then raise exception 'Referral code is invalid or inactive.' using errcode='22023'; end if;
  insert into public.canopy_partner_referrals(partner_id,sme_id,code) values(partner,auth.uid(),code_value)
  on conflict(sme_id) do nothing;
  select * into referral from public.canopy_partner_referrals where sme_id=auth.uid();
  return to_jsonb(referral);
end;
$$;

create or replace function public.canopy_has_subscription_for(p_user_id uuid,p_plan text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists(select 1 from public.canopy_subscriptions s where s.user_id=p_user_id and s.plan=p_plan
    and s.status in ('active','active_demo') and (s.renewal_at is null or s.renewal_at>now())
    and (p_plan<>'partner' or exists(select 1 from public.profiles p where p.id=p_user_id
      and p.role::text='partner' and p.verification_status::text='verified')));
$$;

create or replace function public.canopy_set_partner_client_consent(p_partner_id uuid,p_granted boolean)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare consent_row public.canopy_partner_client_consents;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text='sme') then
    raise exception 'SME account required.' using errcode='42501';
  end if;
  if not exists(select 1 from public.canopy_partner_referrals r where r.partner_id=p_partner_id and r.sme_id=auth.uid()) then
    raise exception 'Consent can be granted only to the referring Partner.' using errcode='42501';
  end if;
  if p_granted and not public.canopy_has_subscription_for(p_partner_id,'partner') then raise exception 'Partner subscription is not active.' using errcode='42501'; end if;
  insert into public.canopy_partner_client_consents(partner_id,sme_id,granted_at,revoked_at)
    values(p_partner_id,auth.uid(),case when p_granted then now() else null end,case when p_granted then null else now() end)
  on conflict(partner_id,sme_id) do update set granted_at=case when p_granted then now() else canopy_partner_client_consents.granted_at end,
    revoked_at=case when p_granted then null else now() end returning * into consent_row;
  return to_jsonb(consent_row);
end;
$$;

create or replace function public.canopy_partner_clients()
returns table(sme_id uuid,company_name text,verification_status text,consent_granted boolean,referral_created_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.canopy_has_subscription('partner') then raise exception 'Active Partner Portal subscription required.' using errcode='42501'; end if;
  return query select r.sme_id,p.company_name::text,p.verification_status::text,(c.revoked_at is null and c.granted_at is not null),r.created_at
    from public.canopy_partner_referrals r join public.profiles p on p.id=r.sme_id
    left join public.canopy_partner_client_consents c on c.partner_id=r.partner_id and c.sme_id=r.sme_id
    where r.partner_id=auth.uid() order by r.created_at desc;
end;
$$;

create or replace function public.canopy_partner_client_data(p_sme_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare holdings_json jsonb; requests_json jsonb; profile_json jsonb;
begin
  if not public.canopy_has_subscription('partner') then raise exception 'Active Partner Portal subscription required.' using errcode='42501'; end if;
  if not exists(select 1 from public.canopy_partner_client_consents c where c.partner_id=auth.uid() and c.sme_id=p_sme_id and c.revoked_at is null)
    then raise exception 'SME has not authorized Partner data access.' using errcode='42501'; end if;
  select jsonb_build_object('company_name',p.company_name,'registration_number',p.registration_number,'sector',p.sector,'verification_status',p.verification_status)
    into profile_json from public.profiles p where p.id=p_sme_id;
  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb) into holdings_json
    from public.holdings h left join public.projects pr on pr.id::text=to_jsonb(h)->>'project_id'
    where coalesce(to_jsonb(h)->>'user_id',to_jsonb(h)->>'profile_id',to_jsonb(h)->>'sme_id',to_jsonb(h)->>'account_id')=p_sme_id::text;
  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb) into requests_json
    from public.carbon_requests r left join public.projects pr on pr.id::text=to_jsonb(r)->>'project_id'
    where coalesce(to_jsonb(r)->>'user_id',to_jsonb(r)->>'profile_id',to_jsonb(r)->>'sme_id',to_jsonb(r)->>'account_id')=p_sme_id::text;
  return jsonb_build_object('profile',coalesce(profile_json,'{}'::jsonb),'holdings',coalesce(holdings_json,'[]'::jsonb),'requests',coalesce(requests_json,'[]'::jsonb));
end;
$$;

create or replace function public.canopy_report_data(p_report_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare report_row public.canopy_report_requests; profile_json jsonb; holdings_json jsonb; requests_json jsonb;
begin
  select * into report_row from public.canopy_report_requests where id=p_report_id and user_id=auth.uid();
  if not found then raise exception 'Report not found.' using errcode='P0002'; end if;
  if report_row.status not in ('ready','ready_demo') then raise exception 'Report is not paid or authorized for download.' using errcode='42501'; end if;
  select jsonb_build_object('company_name',p.company_name,'registration_number',p.registration_number,'contact_name',p.contact_name,'sector',p.sector)
    into profile_json from public.profiles p where p.id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb) into holdings_json
    from public.holdings h left join public.projects pr on pr.id::text=to_jsonb(h)->>'project_id'
    where coalesce(to_jsonb(h)->>'user_id',to_jsonb(h)->>'profile_id',to_jsonb(h)->>'sme_id',to_jsonb(h)->>'account_id')=auth.uid()::text;
  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb) into requests_json
    from public.carbon_requests r left join public.projects pr on pr.id::text=to_jsonb(r)->>'project_id'
    where coalesce(to_jsonb(r)->>'user_id',to_jsonb(r)->>'profile_id',to_jsonb(r)->>'sme_id',to_jsonb(r)->>'account_id')=auth.uid()::text
      and nullif(to_jsonb(r)->>'created_at','')::timestamptz >= report_row.period_start::timestamptz
      and nullif(to_jsonb(r)->>'created_at','')::timestamptz < (report_row.period_end+1)::timestamptz;
  return jsonb_build_object('report',to_jsonb(report_row),'company',coalesce(profile_json,'{}'::jsonb),
    'holdings',coalesce(holdings_json,'[]'::jsonb),'transactions',coalesce(requests_json,'[]'::jsonb),
    'impact_claims_supported',false,'data_note','Only stored Canopy records are included; no emissions or environmental impact estimate is inferred.');
end;
$$;

create or replace function public.canopy_admin_revenue_dashboard()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare streams jsonb; months jsonb;
begin
  if not public.canopy_is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  with actuals as (
    select 'carbon_transaction_fees'::text stream,paid_at as created_at,coalesce(sme_fee_myr,0) amount from public.canopy_transaction_charges where payment_status='paid'
    union all select 'premium_subscription',paid_at,amount_myr from public.canopy_billing_orders where order_type='premium_subscription' and payment_status='paid'
    union all select 'esg_reporting',paid_at,amount_myr from public.canopy_billing_orders where order_type='esg_report' and payment_status='paid'
    union all select 'developer_commissions',paid_at,commission_myr from public.canopy_developer_commissions where payment_status='paid'
    union all select 'partner_subscription',paid_at,amount_myr from public.canopy_billing_orders where order_type='partner_subscription' and payment_status='paid'
  )
  select coalesce(jsonb_object_agg(stream,amount),'{}'::jsonb) into streams from (select stream,round(sum(amount),2) amount from actuals group by stream) s;
  with actuals as (
    select 'carbon_transaction_fees'::text stream,paid_at as created_at,coalesce(sme_fee_myr,0) amount from public.canopy_transaction_charges where payment_status='paid'
    union all select 'premium_subscription',paid_at,amount_myr from public.canopy_billing_orders where order_type='premium_subscription' and payment_status='paid'
    union all select 'esg_reporting',paid_at,amount_myr from public.canopy_billing_orders where order_type='esg_report' and payment_status='paid'
    union all select 'developer_commissions',paid_at,commission_myr from public.canopy_developer_commissions where payment_status='paid'
    union all select 'partner_subscription',paid_at,amount_myr from public.canopy_billing_orders where order_type='partner_subscription' and payment_status='paid'
  )
  select coalesce(jsonb_agg(jsonb_build_object('month',month,'stream',stream,'amount_myr',amount) order by month,stream),'[]'::jsonb)
    into months from (select date_trunc('month',created_at)::date month,stream,round(sum(amount),2) amount from actuals where created_at>=date_trunc('month',now())-interval '11 months' group by 1,2) m;
  return jsonb_build_object('paid_actuals',streams,'monthly',months);
end;
$$;

create or replace function public.canopy_list_projects()
returns setof public.projects language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$
declare is_premium boolean := public.canopy_has_subscription('premium');
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  if public.canopy_is_admin() then return query select * from public.projects order by created_at desc; return; end if;
  return query select p.* from public.projects p left join public.canopy_project_release_rules r on r.project_id=p.id
    where p.listing_status::text='published'
      and (r.project_id is null or (is_premium and r.premium_available_at<=now()) or r.free_available_at<=now())
    order by p.created_at desc;
end;
$$;

create or replace function public.canopy_admin_set_project_release(p_project_id uuid,p_premium_at timestamptz,p_free_at timestamptz)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare row_data public.canopy_project_release_rules;
begin
  if not public.canopy_is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_free_at<p_premium_at then raise exception 'Free release must follow Premium release.' using errcode='22023'; end if;
  insert into public.canopy_project_release_rules(project_id,premium_available_at,free_available_at,updated_by)
  values(p_project_id,p_premium_at,p_free_at,auth.uid())
  on conflict(project_id) do update set premium_available_at=excluded.premium_available_at,free_available_at=excluded.free_available_at,updated_by=auth.uid(),updated_at=now()
  returning * into row_data;
  return to_jsonb(row_data);
end;
$$;

create or replace function public.canopy_admin_assign_project_developer(p_project_id uuid,p_developer_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare mapping public.canopy_project_developers;
begin
  if not public.canopy_is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if not exists(select 1 from public.projects p where p.id=p_project_id) then raise exception 'Project not found.' using errcode='P0002'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_developer_id) then raise exception 'Developer account not found.' using errcode='P0002'; end if;
  insert into public.canopy_project_developers(project_id,developer_id,assigned_by) values(p_project_id,p_developer_id,auth.uid())
  on conflict(project_id) do update set developer_id=excluded.developer_id,assigned_by=auth.uid(),assigned_at=now()
  returning * into mapping;
  return to_jsonb(mapping);
end;
$$;

create or replace function public.canopy_seed_project_release()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if new.listing_status::text='published' and (tg_op='INSERT' or old.listing_status::text<>'published') then
    insert into public.canopy_project_release_rules(project_id,premium_available_at,free_available_at)
    values(new.id,now(),now()+interval '48 hours') on conflict(project_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger canopy_seed_release_after_insert after insert on public.projects for each row execute function public.canopy_seed_project_release();
create trigger canopy_seed_release_after_listing_update after update of listing_status on public.projects for each row execute function public.canopy_seed_project_release();

create or replace function public.canopy_capture_completed_transaction()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  request_data jsonb := to_jsonb(new);
  project_data jsonb;
  owner_id uuid;
  developer uuid;
  project_uuid uuid;
  quantity numeric(14,3);
  unit_price numeric(14,4);
  gross numeric(14,2);
  sme_fee numeric(14,2);
  kind text;
  payment_state text := 'pending';
begin
  if lower(new.status::text)<>'completed' or lower(old.status::text)='completed' then return new; end if;
  project_uuid := nullif(request_data->>'project_id','')::uuid;
  select to_jsonb(p) into project_data from public.projects p where p.id=project_uuid;
  quantity := coalesce(nullif(request_data->>'quantity_tco2e','')::numeric,0);
  kind := lower(coalesce(request_data->>'request_type','unknown'));
  owner_id := coalesce(nullif(request_data->>'user_id','')::uuid,nullif(request_data->>'profile_id','')::uuid,
    nullif(request_data->>'sme_id','')::uuid,nullif(request_data->>'account_id','')::uuid);
  select d.developer_id into developer from public.canopy_project_developers d where d.project_id=project_uuid;
  if kind not in ('buy','purchase','sell','sale') then return new; end if;
  if kind in ('buy','purchase') then
    unit_price := nullif(project_data->>'price_myr','')::numeric;
  else
    unit_price := coalesce(nullif(request_data->>'requested_price_myr','')::numeric,
      nullif(request_data->>'price_myr','')::numeric,nullif(request_data->>'price','')::numeric);
  end if;
  if quantity<=0 or unit_price is null or owner_id is null then payment_state := 'needs_review'; end if;
  gross := case when unit_price is not null and quantity>0 then round(unit_price*quantity,2) else null end;
  sme_fee := case when gross is not null then round(gross*0.015,2) else null end;
  insert into public.canopy_transaction_charges(request_id,user_id,project_id,developer_id,transaction_type,quantity_tco2e,transaction_value_myr,sme_fee_myr,payment_status,created_at,approved_at,completed_at)
    values(new.id,owner_id,project_uuid,developer,kind,quantity,gross,sme_fee,payment_state,
      coalesce(nullif(request_data->>'created_at','')::timestamptz,now()),now(),now()) on conflict(request_id) do nothing;
  if developer is not null and gross is not null and kind in ('buy','purchase') then
    insert into public.canopy_developer_commissions(request_id,developer_id,project_id,quantity_tco2e,transaction_value_myr,commission_myr,invoice_reference)
      values(new.id,developer,project_uuid,quantity,gross,round(gross*0.015,2),'CAN-DEV-'||upper(substr(replace(new.id::text,'-',''),1,12)))
      on conflict(request_id) do nothing;
  end if;
  if payment_state='needs_review' then
    insert into public.canopy_reconciliation_alerts(request_id,detail)
      values(new.id,'Completed transaction lacks a supported owner or price field; review existing carbon_requests schema and reconcile manually.')
      on conflict(request_id) do nothing;
  end if;
  return new;
exception when others then
  insert into public.canopy_reconciliation_alerts(request_id,detail)
    values(new.id,'Revenue capture needs reconciliation: '||left(sqlerrm,800))
    on conflict(request_id) do update set detail=excluded.detail;
  return new;
end;
$$;
create trigger canopy_capture_transaction_after_complete after update of status on public.carbon_requests
for each row when (lower(new.status::text)='completed') execute function public.canopy_capture_completed_transaction();

revoke all on function public.canopy_create_billing_order(text,text,date,date) from public,anon;
revoke all on function public.canopy_simulate_billing_payment(uuid) from public,anon;
revoke all on function public.canopy_cancel_subscription(text) from public,anon;
revoke all on function public.canopy_admin_set_billing_status(uuid,text,text,text) from public,anon;
revoke all on function public.canopy_admin_set_developer_status(uuid,text,text,text) from public,anon;
revoke all on function public.canopy_admin_set_transaction_fee_status(uuid,text,text,text) from public,anon;
revoke all on function public.canopy_admin_set_referral_reward(text,numeric,numeric) from public,anon;
revoke all on function public.canopy_create_partner_code() from public,anon;
revoke all on function public.canopy_claim_partner_referral(text) from public,anon;
revoke all on function public.canopy_set_partner_client_consent(uuid,boolean) from public,anon;
revoke all on function public.canopy_partner_clients() from public,anon;
revoke all on function public.canopy_partner_client_data(uuid) from public,anon;
revoke all on function public.canopy_report_data(uuid) from public,anon;
revoke all on function public.canopy_admin_revenue_dashboard() from public,anon;
revoke all on function public.canopy_list_projects() from public,anon;
revoke all on function public.canopy_admin_set_project_release(uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.canopy_admin_assign_project_developer(uuid,uuid) from public,anon;
grant execute on function public.canopy_create_billing_order(text,text,date,date) to authenticated;
grant execute on function public.canopy_simulate_billing_payment(uuid) to authenticated;
grant execute on function public.canopy_cancel_subscription(text) to authenticated;
grant execute on function public.canopy_admin_set_billing_status(uuid,text,text,text) to authenticated;
grant execute on function public.canopy_admin_set_developer_status(uuid,text,text,text) to authenticated;
grant execute on function public.canopy_admin_set_transaction_fee_status(uuid,text,text,text) to authenticated;
grant execute on function public.canopy_admin_set_referral_reward(text,numeric,numeric) to authenticated;
grant execute on function public.canopy_create_partner_code() to authenticated;
grant execute on function public.canopy_claim_partner_referral(text) to authenticated;
grant execute on function public.canopy_set_partner_client_consent(uuid,boolean) to authenticated;
grant execute on function public.canopy_partner_clients() to authenticated;
grant execute on function public.canopy_partner_client_data(uuid) to authenticated;
grant execute on function public.canopy_report_data(uuid) to authenticated;
grant execute on function public.canopy_admin_revenue_dashboard() to authenticated;
grant execute on function public.canopy_list_projects() to authenticated;
grant execute on function public.canopy_admin_set_project_release(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.canopy_admin_assign_project_developer(uuid,uuid) to authenticated;

create policy canopy_project_release_access on public.projects as permissive for select to authenticated
using (
  public.canopy_is_admin()
  or (listing_status::text='published' and (
    not exists(select 1 from public.canopy_project_release_rules r where r.project_id=projects.id)
    or exists(select 1 from public.canopy_project_release_rules r where r.project_id=projects.id and r.free_available_at<=now())
    or (public.canopy_has_subscription('premium') and exists(
      select 1 from public.canopy_project_release_rules r where r.project_id=projects.id and r.premium_available_at<=now()))
  ))
);

create policy canopy_project_release_gate on public.projects as restrictive for select to anon,authenticated
using (
  public.canopy_is_admin()
  or (listing_status::text='published' and (
    not exists(select 1 from public.canopy_project_release_rules r where r.project_id=projects.id)
    or exists(select 1 from public.canopy_project_release_rules r where r.project_id=projects.id and r.free_available_at<=now())
    or (public.canopy_has_subscription('premium') and exists(
      select 1 from public.canopy_project_release_rules r where r.project_id=projects.id and r.premium_available_at<=now()))
  ))
);
