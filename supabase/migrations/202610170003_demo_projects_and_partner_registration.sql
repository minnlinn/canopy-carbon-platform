do $$
declare
  role_type oid;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.projects') is null
     or to_regclass('public.holdings') is null
     or to_regclass('public.carbon_requests') is null then
    raise exception 'Canopy demo migration requires the existing profiles, projects, holdings and carbon_requests tables.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Canopy demo migration requires the existing public.is_admin() authorization function.';
  end if;
  if to_regclass('public.canopy_subscriptions') is null
     or to_regclass('public.canopy_partner_client_consents') is null then
    raise exception 'Apply/review the Canopy subscription and Partner consent migration before this migration.';
  end if;
  if to_regclass('public.canopy_developer_commissions') is null
     or to_regclass('public.canopy_billing_audit') is null then
    raise exception 'Apply/review the Canopy revenue migration before this migration.';
  end if;
  select a.atttypid into role_type
  from pg_attribute a
  where a.attrelid='public.profiles'::regclass and a.attname='role' and not a.attisdropped;
  if role_type is null or not exists(select 1 from pg_enum where enumtypid=role_type and enumlabel='partner') then
    raise exception 'public.profiles.role must support the partner enum value before applying this migration.';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='verification_status')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='company_name') then
    raise exception 'Existing profile columns do not match the Canopy account contract.';
  end if;
end;
$$;

create table if not exists public.canopy_demo_projects (
  id uuid primary key default gen_random_uuid(),
  registry_name text not null default 'Verra VCS',
  registry_project_id text not null,
  project_name text not null,
  location text not null,
  category text not null,
  project_type text not null,
  description text not null,
  project_proponent text,
  public_reference_url text not null,
  registry_url text not null,
  representative_image_url text not null,
  image_attribution text not null default 'Generic representative image; not a photograph of this project.',
  source_checked_at date not null default current_date,
  listing_active boolean not null default true,
  simulated_price_myr numeric(12,2),
  simulated_inventory_tco2e numeric(14,2) not null default 0 check (simulated_inventory_tco2e >= 0),
  demo_trading_enabled boolean not null default false,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registry_name, registry_project_id),
  check (simulated_price_myr is null or simulated_price_myr >= 0)
);

insert into public.canopy_demo_projects (
  registry_name, registry_project_id, project_name, location, category, project_type,
  description, project_proponent, public_reference_url, registry_url, representative_image_url,
  image_attribution, simulated_price_myr, simulated_inventory_tco2e, demo_trading_enabled
) values
  ('Verra VCS','2609','Kuamut Rainforest Conservation Project','Sabah, Malaysia','Forest conservation / Improved Forest Management','Improved Forest Management','Protects tropical rainforest in Sabah. Public project information notes it was featured in Bursa Carbon Exchange’s first Malaysian carbon-credit auction in July 2024.','Permian Malaysia Sdn Bhd','https://carbon.supply/p/verra/2609/','https://registry.verra.org/app/projectDetail/VCS/2609','https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80','Generic Unsplash forest image under the Unsplash License; not a project photograph.',null,0,false),
  ('Verra VCS','672','INFAPRO Rehabilitation of Logged-over Dipterocarp Forest','Yayasan Sabah Concession Area, Sabah, Malaysia','Forest rehabilitation / Improved Forest Management','Improved Forest Management','Rehabilitation of previously logged forest within the Yayasan Sabah concession area.','Face the Future (project participant listed in public registry reference)','https://carbon.supply/p/verra/672/','https://registry.verra.org/app/projectDetail/VCS/672','https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1200&q=80','Generic Unsplash forest image under the Unsplash License; not a project photograph.',null,0,false),
  ('Verra VCS','4279','Monsoon Methane Avoidance from Industrial Wastewater in Malaysia Grouped Project','Langkap, Perak, Malaysia','Methane reduction / Wastewater management','Industrial wastewater methane avoidance','Methane avoidance associated with industrial wastewater treatment.','Monsoon Carbon Pte Ltd (project participant listed in public registry reference)','https://carbon.supply/p/verra/4279/','https://registry.verra.org/app/projectDetail/VCS/4279','https://images.unsplash.com/photo-1516937941344-00b4e0337589?auto=format&fit=crop&w=1200&q=80','Generic Unsplash industrial image under the Unsplash License; not a project photograph.',null,0,false),
  ('Verra VCS','5542','Malaysia Grouped Biomass Waste Recovery and Utilization Project','Peninsular Malaysia','Biomass / Waste recovery','Biomass waste recovery and utilization','Biomass waste recovery and utilisation to reduce greenhouse gas emissions.','Climate Quest Sdn Bhd','https://carbon.supply/p/verra/5542/','https://registry.verra.org/app/projectDetail/VCS/5542','https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=80','Generic Unsplash industrial image under the Unsplash License; not a project photograph.',null,0,false)
on conflict (registry_name, registry_project_id) do nothing;

create table if not exists public.canopy_account_applications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('sme','partner')),
  organization_type text,
  phone text,
  business_description text,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text not null default ''
);

create table if not exists public.canopy_account_review_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  account_type text not null check (account_type in ('sme','partner')),
  previous_status text not null,
  decision text not null check (decision in ('approved','rejected')),
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.canopy_demo_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.canopy_demo_projects(id),
  quantity_tco2e numeric(14,2) not null check (quantity_tco2e >= 0.01 and quantity_tco2e * 100 = trunc(quantity_tco2e * 100)),
  simulated_unit_price_myr numeric(12,2) not null check (simulated_unit_price_myr >= 0),
  simulated_credit_value_myr numeric(14,2) not null,
  platform_fee_rate numeric(6,5) not null default 0.015 check (platform_fee_rate = 0.015),
  simulated_platform_fee_myr numeric(14,2) not null,
  simulated_total_myr numeric(14,2) not null,
  payment_status text not null default 'demo_not_collected' check (payment_status = 'demo_not_collected'),
  request_status text not null default 'pending_admin_review' check (request_status in ('pending_admin_review','approved_demo','rejected')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.canopy_demo_entitlement_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.canopy_demo_projects(id),
  event_type text not null check (event_type in ('allocation','transfer_in','transfer_out','adjustment')),
  delta_tco2e numeric(14,2) not null check (delta_tco2e <> 0 and delta_tco2e * 100 = trunc(delta_tco2e * 100)),
  purchase_request_id uuid references public.canopy_demo_purchase_requests(id),
  actor_id uuid not null references auth.users(id),
  note text not null,
  created_at timestamptz not null default now(),
  unique (purchase_request_id, event_type)
);

create table if not exists public.canopy_demo_project_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.canopy_demo_projects(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.canopy_developer_commission_arrangements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  developer_id uuid not null references auth.users(id),
  commission_rate numeric(6,5) not null check (commission_rate>=0 and commission_rate<=1),
  agreement_reference text not null,
  active boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(project_id,developer_id),
  check (ends_at is null or ends_at>=starts_at)
);

create table if not exists public.canopy_partner_applications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_name text not null,
  business_registration_number text not null,
  organization_type text not null,
  contact_name text not null,
  business_email text not null,
  phone text not null,
  business_description text not null,
  created_at timestamptz not null default now()
);

alter table public.canopy_account_applications enable row level security;
alter table public.canopy_account_review_audit enable row level security;
alter table public.canopy_demo_projects enable row level security;
alter table public.canopy_demo_purchase_requests enable row level security;
alter table public.canopy_demo_entitlement_ledger enable row level security;
alter table public.canopy_demo_project_audit enable row level security;
alter table public.canopy_partner_applications enable row level security;
alter table public.canopy_developer_commission_arrangements enable row level security;

create or replace function public.canopy_partner_can_access_sme(p_sme_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth
as $$
  select exists(
    select 1 from public.profiles partner
    join public.canopy_subscriptions subscription on subscription.user_id=partner.id
      and subscription.plan='partner' and subscription.status in ('active','active_demo')
      and (subscription.renewal_at is null or subscription.renewal_at>now())
    join public.canopy_partner_client_consents consent on consent.partner_id=partner.id
      and consent.sme_id=p_sme_id and consent.revoked_at is null
    where partner.id=auth.uid() and partner.role::text='partner'
      and partner.verification_status::text='verified'
  );
$$;
revoke all on function public.canopy_partner_can_access_sme(uuid) from public,anon;
grant execute on function public.canopy_partner_can_access_sme(uuid) to authenticated;

create policy canopy_account_applications_read on public.canopy_account_applications for select to authenticated
  using (user_id=auth.uid() or public.is_admin());
create policy canopy_account_review_audit_admin_read on public.canopy_account_review_audit for select to authenticated
  using (public.is_admin());
create policy canopy_demo_projects_public_read on public.canopy_demo_projects for select to anon,authenticated
  using (listing_active or public.is_admin());
create policy canopy_demo_purchase_owner_admin_read on public.canopy_demo_purchase_requests for select to authenticated
  using (user_id=auth.uid() or public.is_admin());
create policy canopy_demo_ledger_owner_admin_read on public.canopy_demo_entitlement_ledger for select to authenticated
  using (user_id=auth.uid() or public.is_admin() or public.canopy_partner_can_access_sme(user_id));
create policy canopy_demo_project_audit_admin_read on public.canopy_demo_project_audit for select to authenticated
  using (public.is_admin());
create policy canopy_partner_applications_self_admin_read on public.canopy_partner_applications for select to authenticated
  using (user_id=auth.uid() or public.is_admin());
create policy canopy_developer_arrangements_admin_read on public.canopy_developer_commission_arrangements for select to authenticated
  using (public.is_admin() or developer_id=auth.uid());

revoke all on public.canopy_account_applications, public.canopy_account_review_audit,
  public.canopy_demo_projects, public.canopy_demo_purchase_requests,
  public.canopy_demo_entitlement_ledger, public.canopy_demo_project_audit,
  public.canopy_partner_applications,public.canopy_developer_commission_arrangements from anon,authenticated;
grant select on public.canopy_account_applications, public.canopy_account_review_audit,
  public.canopy_demo_projects, public.canopy_demo_purchase_requests,
  public.canopy_demo_entitlement_ledger, public.canopy_demo_project_audit,
  public.canopy_partner_applications,public.canopy_developer_commission_arrangements to authenticated;
grant select on public.canopy_demo_projects to anon;

create or replace function public.canopy_require_developer_commission_agreement()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare arrangement public.canopy_developer_commission_arrangements;
begin
  select * into arrangement from public.canopy_developer_commission_arrangements
  where project_id=new.project_id and developer_id=new.developer_id and active
    and starts_at<=now() and (ends_at is null or ends_at>=now())
  order by created_at desc limit 1;
  if not found then return null; end if;
  new.commission_rate:=arrangement.commission_rate;
  new.commission_myr:=round(new.transaction_value_myr*arrangement.commission_rate,2);
  return new;
end;
$$;
create trigger canopy_developer_commission_agreement_gate
before insert on public.canopy_developer_commissions
for each row execute function public.canopy_require_developer_commission_agreement();

create or replace function public.canopy_admin_set_developer_commission_arrangement(
  p_admin_id uuid,p_project_id uuid,p_developer_id uuid,p_commission_rate numeric,
  p_agreement_reference text,p_active boolean,p_note text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare arrangement public.canopy_developer_commission_arrangements; previous_values jsonb;
begin
  if auth.uid() is distinct from p_admin_id or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_commission_rate<0 or p_commission_rate>1 or length(trim(coalesce(p_agreement_reference,'')))<3 or length(trim(coalesce(p_note,'')))<3 then
    raise exception 'A valid commission rate, explicit agreement reference and audit note are required.' using errcode='22023';
  end if;
  if not exists(select 1 from public.projects where id=p_project_id)
     or not exists(select 1 from public.profiles where id=p_developer_id) then raise exception 'Project or developer account not found.' using errcode='P0002'; end if;
  select to_jsonb(a) into previous_values from public.canopy_developer_commission_arrangements a where project_id=p_project_id and developer_id=p_developer_id for update;
  insert into public.canopy_developer_commission_arrangements(project_id,developer_id,commission_rate,agreement_reference,active,created_by,starts_at,ends_at)
  values(p_project_id,p_developer_id,p_commission_rate,trim(p_agreement_reference),p_active,p_admin_id,now(),null)
  on conflict(project_id,developer_id) do update set commission_rate=excluded.commission_rate,agreement_reference=excluded.agreement_reference,active=excluded.active,starts_at=now(),ends_at=null,created_by=p_admin_id
  returning * into arrangement;
  insert into public.canopy_billing_audit(actor_id,target_type,target_id,previous_status,new_status,note)
  values(p_admin_id,'developer_commission_arrangement',arrangement.id,case when coalesce((previous_values->>'active')::boolean,false) then 'active' else 'inactive' end,
    case when arrangement.active then 'active' else 'inactive' end,trim(p_note)||' Agreement: '||arrangement.agreement_reference);
  return to_jsonb(arrangement);
end;
$$;

create or replace function public.canopy_partner_can_access_sme(p_sme_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,auth
as $$
  select exists(
    select 1 from public.profiles partner
    join public.canopy_subscriptions subscription on subscription.user_id=partner.id
      and subscription.plan='partner' and subscription.status in ('active','active_demo')
      and (subscription.renewal_at is null or subscription.renewal_at>now())
    join public.canopy_partner_client_consents consent on consent.partner_id=partner.id
      and consent.sme_id=p_sme_id and consent.revoked_at is null
    where partner.id=auth.uid() and partner.role::text='partner'
      and partner.verification_status::text='verified'
  );
$$;

revoke all on function public.canopy_partner_can_access_sme(uuid) from public,anon;
grant execute on function public.canopy_partner_can_access_sme(uuid) to authenticated;

create policy canopy_holdings_partner_consent_gate on public.holdings as restrictive for select to public
  using (public.is_admin() or owner_id=auth.uid() or public.canopy_partner_can_access_sme(owner_id));
create policy canopy_requests_partner_consent_gate on public.carbon_requests as restrictive for select to public
  using (public.is_admin() or requester_id=auth.uid() or recipient_id=auth.uid()
    or public.canopy_partner_can_access_sme(requester_id) or public.canopy_partner_can_access_sme(recipient_id));

create or replace function public.canopy_assign_signup_role()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare requested_type text;
begin
  select lower(coalesce(u.raw_user_meta_data->>'canopy_account_type','sme'))
    into requested_type from auth.users u where u.id=new.id;
  if coalesce(auth.role(),'') = 'service_role' then
    if new.role::text<>'admin' and requested_type='partner' then
      new.role := 'partner'::public.user_role;
      new.verification_status := 'pending'::public.verification_status;
    elsif new.role::text not in ('admin','sme','partner') then
      new.role := 'sme'::public.user_role;
      new.verification_status := 'pending'::public.verification_status;
    end if;
  else
    new.role := case when requested_type='partner' then 'partner'::public.user_role else 'sme'::public.user_role end;
    new.verification_status := 'pending'::public.verification_status;
  end if;
  return new;
end;
$$;
create trigger zzzz_canopy_assign_signup_role_before_insert
before insert on public.profiles
for each row execute function public.canopy_assign_signup_role();

create or replace function public.canopy_capture_account_application()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare metadata jsonb; account_email text;
begin
  select raw_user_meta_data,email into metadata,account_email from auth.users where id=new.id;
  insert into public.canopy_account_applications(user_id,account_type,organization_type,phone,business_description)
  values(new.id,new.role::text,metadata->>'organization_type',metadata->>'phone',coalesce(metadata->>'business_description',''))
  on conflict(user_id) do nothing;
  if new.role::text='partner' then
    insert into public.canopy_partner_applications(user_id,organization_name,business_registration_number,organization_type,contact_name,business_email,phone,business_description)
    values(new.id,coalesce(metadata->>'company_name',''),coalesce(metadata->>'registration_number',''),coalesce(metadata->>'organization_type',''),coalesce(metadata->>'contact_name',''),coalesce(account_email,''),coalesce(metadata->>'phone',''),coalesce(metadata->>'business_description',''))
    on conflict(user_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger canopy_capture_account_application_after_insert
after insert on public.profiles for each row execute function public.canopy_capture_account_application();

create or replace function public.canopy_admin_review_registration(p_admin_id uuid,p_user_id uuid,p_decision text,p_note text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare target public.profiles; application public.canopy_account_applications; previous_status text; next_status text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Trusted server action required.' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=p_admin_id and role::text='admin') then raise exception 'Authorized Admin required.' using errcode='42501'; end if;
  if p_decision not in ('approve','reject') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Choose approve/reject and provide an audit note.' using errcode='22023'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found or target.role::text not in ('sme','partner') or target.verification_status::text<>'pending' then
    raise exception 'Only pending SME or Partner accounts can be reviewed.' using errcode='22023';
  end if;
  insert into public.canopy_account_applications(user_id,account_type,organization_type,phone,business_description)
    values(target.id,target.role::text,null,null,'') on conflict(user_id) do nothing;
  select * into application from public.canopy_account_applications where user_id=p_user_id for update;
  previous_status:=application.review_status;
  if previous_status<>'pending' then raise exception 'Application is no longer pending.' using errcode='22023'; end if;
  next_status:=case when p_decision='approve' then 'approved' else 'rejected' end;
  update public.canopy_account_applications set review_status=next_status,reviewed_by=p_admin_id,reviewed_at=now(),review_note=trim(p_note) where user_id=p_user_id;
  update public.profiles set verification_status=case when p_decision='approve' then 'verified'::public.verification_status else verification_status end,
    review_note=trim(p_note),updated_at=now() where id=p_user_id;
  insert into public.canopy_account_review_audit(user_id,admin_id,account_type,previous_status,decision,note)
    values(p_user_id,p_admin_id,target.role::text,previous_status,next_status,trim(p_note));
  if p_decision='approve' and to_regclass('public.canopy_email_notifications') is not null then
    execute 'insert into public.canopy_email_notifications(user_id,notification_type,recipient) select $1,''account_verified'',email from auth.users where id=$1 on conflict(user_id,notification_type) do nothing' using p_user_id;
  end if;
  return jsonb_build_object('user_id',p_user_id,'role',target.role::text,'review_status',next_status);
end;
$$;
revoke all on function public.canopy_admin_review_registration(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.canopy_admin_review_registration(uuid,uuid,text,text) to service_role;

create or replace function public.canopy_admin_update_demo_project(p_admin_id uuid,p_project_id uuid,p_price_myr numeric,p_inventory_tco2e numeric,p_trading_enabled boolean,p_note text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare project_row public.canopy_demo_projects; old_values jsonb;
begin
  if auth.uid() is distinct from p_admin_id or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_inventory_tco2e<0 or (p_trading_enabled and (p_price_myr is null or p_price_myr<=0)) or length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Set a valid simulated price/inventory and audit note before enabling demo trading.' using errcode='22023';
  end if;
  select * into project_row from public.canopy_demo_projects where id=p_project_id for update;
  if not found then raise exception 'Demo project not found.' using errcode='P0002'; end if;
  if p_inventory_tco2e < coalesce((select sum(delta_tco2e) from public.canopy_demo_entitlement_ledger where project_id=p_project_id),0)
    + coalesce((select sum(quantity_tco2e) from public.canopy_demo_purchase_requests where project_id=p_project_id and request_status='pending_admin_review'),0) then
    raise exception 'Simulated inventory cannot fall below allocated plus pending demo quantities.' using errcode='22023';
  end if;
  old_values:=jsonb_build_object('simulated_price_myr',project_row.simulated_price_myr,'simulated_inventory_tco2e',project_row.simulated_inventory_tco2e,'demo_trading_enabled',project_row.demo_trading_enabled);
  update public.canopy_demo_projects set simulated_price_myr=p_price_myr,simulated_inventory_tco2e=p_inventory_tco2e,demo_trading_enabled=p_trading_enabled,updated_by=p_admin_id,updated_at=now() where id=p_project_id returning * into project_row;
  insert into public.canopy_demo_project_audit(project_id,actor_id,action,previous_values,new_values,note)
    values(p_project_id,p_admin_id,'demo_settings_updated',old_values,jsonb_build_object('simulated_price_myr',p_price_myr,'simulated_inventory_tco2e',p_inventory_tco2e,'demo_trading_enabled',p_trading_enabled),trim(p_note));
  return to_jsonb(project_row);
end;
$$;

create or replace function public.canopy_admin_save_demo_project_facts(
  p_admin_id uuid,p_project_id uuid,p_registry_name text,p_registry_project_id text,
  p_project_name text,p_location text,p_category text,p_project_type text,p_description text,
  p_project_proponent text,p_public_reference_url text,p_registry_url text,
  p_image_url text,p_image_attribution text,p_note text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare project_row public.canopy_demo_projects; old_values jsonb; action_name text;
begin
  if auth.uid() is distinct from p_admin_id or not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if length(trim(coalesce(p_registry_name,'')))<2 or length(trim(coalesce(p_registry_project_id,'')))<1
     or length(trim(coalesce(p_project_name,'')))<3 or length(trim(coalesce(p_location,'')))<2
     or length(trim(coalesce(p_category,'')))<2 or length(trim(coalesce(p_project_type,'')))<2
     or length(trim(coalesce(p_description,'')))<10 or p_public_reference_url !~ '^https://'
     or p_registry_url !~ '^https://' or p_image_url !~ '^https://images[.]unsplash[.]com/'
     or length(trim(coalesce(p_image_attribution,'')))<5 or length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Required project facts, HTTPS sources, representative image attribution and audit note are required.' using errcode='22023';
  end if;
  if p_project_id is null then
    insert into public.canopy_demo_projects(registry_name,registry_project_id,project_name,location,category,project_type,description,project_proponent,public_reference_url,registry_url,representative_image_url,image_attribution,created_by,updated_by)
    values(trim(p_registry_name),trim(p_registry_project_id),trim(p_project_name),trim(p_location),trim(p_category),trim(p_project_type),trim(p_description),nullif(trim(p_project_proponent),''),trim(p_public_reference_url),trim(p_registry_url),trim(p_image_url),trim(p_image_attribution),p_admin_id,p_admin_id)
    returning * into project_row;
    action_name:='demo_project_added';
    old_values:='{}'::jsonb;
  else
    select * into project_row from public.canopy_demo_projects where id=p_project_id for update;
    if not found then raise exception 'Demonstration project not found.' using errcode='P0002'; end if;
    old_values:=jsonb_build_object('registry_name',project_row.registry_name,'registry_project_id',project_row.registry_project_id,'project_name',project_row.project_name,'location',project_row.location,'category',project_row.category,'project_type',project_row.project_type,'description',project_row.description,'project_proponent',project_row.project_proponent,'public_reference_url',project_row.public_reference_url,'registry_url',project_row.registry_url,'representative_image_url',project_row.representative_image_url);
    update public.canopy_demo_projects set registry_name=trim(p_registry_name),registry_project_id=trim(p_registry_project_id),project_name=trim(p_project_name),location=trim(p_location),category=trim(p_category),project_type=trim(p_project_type),description=trim(p_description),project_proponent=nullif(trim(p_project_proponent),''),public_reference_url=trim(p_public_reference_url),registry_url=trim(p_registry_url),representative_image_url=trim(p_image_url),image_attribution=trim(p_image_attribution),updated_by=p_admin_id,updated_at=now()
    where id=p_project_id returning * into project_row;
    action_name:='demo_project_facts_updated';
  end if;
  insert into public.canopy_demo_project_audit(project_id,actor_id,action,previous_values,new_values,note)
  values(project_row.id,p_admin_id,action_name,old_values,jsonb_build_object('registry_name',project_row.registry_name,'registry_project_id',project_row.registry_project_id,'project_name',project_row.project_name,'location',project_row.location,'category',project_row.category,'project_type',project_row.project_type,'description',project_row.description,'project_proponent',project_row.project_proponent,'public_reference_url',project_row.public_reference_url,'registry_url',project_row.registry_url,'representative_image_url',project_row.representative_image_url),trim(p_note));
  return to_jsonb(project_row);
end;
$$;

create or replace function public.canopy_request_demo_purchase(p_project_id uuid,p_quantity numeric)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare project_row public.canopy_demo_projects; user_role text; verification text; allocated numeric(14,2); pending numeric(14,2); credit_value numeric(14,2); fee numeric(14,2); request_row public.canopy_demo_purchase_requests;
begin
  select role::text,verification_status::text into user_role,verification from public.profiles where id=auth.uid();
  if user_role<>'sme' or verification<>'verified' then raise exception 'Verified SME account required.' using errcode='42501'; end if;
  if p_quantity<0.01 or p_quantity*100<>trunc(p_quantity*100) then raise exception 'Use quantities of at least 0.01 tCO2e in 0.01 increments.' using errcode='22023'; end if;
  select * into project_row from public.canopy_demo_projects where id=p_project_id and listing_active for update;
  if not found then raise exception 'Demonstration project is unavailable.' using errcode='P0002'; end if;
  if not project_row.demo_trading_enabled or project_row.simulated_price_myr is null then raise exception 'Demo trading has not been enabled for this listing.' using errcode='22023'; end if;
  select coalesce(sum(delta_tco2e),0) into allocated from public.canopy_demo_entitlement_ledger where project_id=p_project_id;
  select coalesce(sum(quantity_tco2e),0) into pending from public.canopy_demo_purchase_requests where project_id=p_project_id and request_status='pending_admin_review';
  if p_quantity>project_row.simulated_inventory_tco2e-allocated-pending then raise exception 'Not enough simulated available inventory.' using errcode='22023'; end if;
  credit_value:=round(project_row.simulated_price_myr*p_quantity,2); fee:=round(credit_value*0.015,2);
  insert into public.canopy_demo_purchase_requests(user_id,project_id,quantity_tco2e,simulated_unit_price_myr,simulated_credit_value_myr,simulated_platform_fee_myr,simulated_total_myr)
  values(auth.uid(),p_project_id,p_quantity,project_row.simulated_price_myr,credit_value,fee,credit_value+fee) returning * into request_row;
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
    select coalesce(sum(delta_tco2e),0) into allocated from public.canopy_demo_entitlement_ledger where project_id=purchase.project_id;
    select coalesce(sum(quantity_tco2e),0) into other_pending from public.canopy_demo_purchase_requests where project_id=purchase.project_id and request_status='pending_admin_review' and id<>p_request_id;
    if purchase.quantity_tco2e>project_row.simulated_inventory_tco2e-allocated-other_pending then raise exception 'Insufficient simulated inventory at approval.' using errcode='22023'; end if;
    insert into public.canopy_demo_entitlement_ledger(user_id,project_id,event_type,delta_tco2e,purchase_request_id,actor_id,note)
      values(purchase.user_id,purchase.project_id,'allocation',purchase.quantity_tco2e,purchase.id,p_admin_id,'Demo allocation only; no real carbon credits are transferred.') on conflict(purchase_request_id,event_type) do nothing;
    next_status:='approved_demo';
  else next_status:='rejected'; end if;
  update public.canopy_demo_purchase_requests set request_status=next_status,review_note=trim(p_note),reviewed_by=p_admin_id,reviewed_at=now() where id=p_request_id returning * into purchase;
  return to_jsonb(purchase);
end;
$$;

revoke all on function public.canopy_admin_update_demo_project(uuid,uuid,numeric,numeric,boolean,text) from public,anon;
revoke all on function public.canopy_admin_save_demo_project_facts(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.canopy_request_demo_purchase(uuid,numeric) from public,anon;
revoke all on function public.canopy_admin_review_demo_purchase(uuid,uuid,text,text) from public,anon;
grant execute on function public.canopy_admin_update_demo_project(uuid,uuid,numeric,numeric,boolean,text) to authenticated;
grant execute on function public.canopy_admin_save_demo_project_facts(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.canopy_request_demo_purchase(uuid,numeric) to authenticated;
grant execute on function public.canopy_admin_review_demo_purchase(uuid,uuid,text,text) to authenticated;
