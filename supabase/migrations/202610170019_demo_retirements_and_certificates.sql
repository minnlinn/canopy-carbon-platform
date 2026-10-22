-- Canopy simulated retirement statements. Run after migrations 001-018.
-- DEMONSTRATION ONLY: no registry, BCX, payment, or verified emission-reduction claim is created.
begin;

do $$
begin
  if to_regclass('public.canopy_demo_entitlement_ledger') is null
     or to_regclass('public.canopy_demo_projects') is null
     or to_regclass('public.canopy_demo_trade_listings') is null
     or to_regprocedure('public.canopy_is_account_active(uuid)') is null then
    raise exception 'Apply migrations 001-018 before this retirement migration.';
  end if;
end;
$$;

create table if not exists public.canopy_demo_retirement_pools (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.canopy_demo_projects(id),
  pool_reference text not null unique,
  total_tco2e numeric(14,2) not null default 0 check (total_tco2e >= 0 and total_tco2e <= 1 and total_tco2e * 100 = trunc(total_tco2e * 100)),
  status text not null default 'open' check (status in ('open','completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.canopy_demo_retirement_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null references public.canopy_demo_projects(id),
  quantity_tco2e numeric(14,2) not null check (quantity_tco2e >= 0.01 and quantity_tco2e * 100 = trunc(quantity_tco2e * 100)),
  beneficiary_name text not null check (length(trim(beneficiary_name)) >= 2),
  retirement_purpose text,
  retirement_fee_usd numeric(14,2) not null check (retirement_fee_usd >= 0),
  fee_note text not null default 'Illustrative USD fee only; no wallet deduction or real payment is made.',
  statement_reference text not null unique,
  status text not null default 'requested' check (status in ('requested','processing','completed','rejected','failed','voided')),
  pool_id uuid references public.canopy_demo_retirement_pools(id),
  idempotency_key text not null,
  review_note text not null default '',
  reviewed_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  completed_at timestamptz,
  unique (user_id,idempotency_key)
);

create table if not exists public.canopy_demo_retirement_audit (
  id uuid primary key default gen_random_uuid(),
  retirement_request_id uuid not null references public.canopy_demo_retirement_requests(id) on delete cascade,
  actor_id uuid references auth.users(id),
  previous_status text,
  new_status text not null,
  note text not null,
  created_at timestamptz not null default now()
);

alter table public.canopy_demo_entitlement_ledger
  add column if not exists retirement_request_id uuid references public.canopy_demo_retirement_requests(id);
alter table public.canopy_demo_entitlement_ledger drop constraint if exists canopy_demo_entitlement_ledger_event_type_check;
alter table public.canopy_demo_entitlement_ledger add constraint canopy_demo_entitlement_ledger_event_type_check
  check (event_type in ('allocation','transfer_in','transfer_out','adjustment','retirement_reserve','retirement_release'));
create unique index if not exists canopy_demo_retirement_ledger_once
  on public.canopy_demo_entitlement_ledger(retirement_request_id,event_type)
  where retirement_request_id is not null;
create index if not exists canopy_demo_retirement_request_owner_status_idx
  on public.canopy_demo_retirement_requests(user_id,status,requested_at desc);
create index if not exists canopy_demo_retirement_request_project_status_idx
  on public.canopy_demo_retirement_requests(project_id,status,requested_at desc);

alter table public.canopy_demo_retirement_pools enable row level security;
alter table public.canopy_demo_retirement_requests enable row level security;
alter table public.canopy_demo_retirement_audit enable row level security;
revoke all on public.canopy_demo_retirement_pools, public.canopy_demo_retirement_requests, public.canopy_demo_retirement_audit from anon, authenticated;
grant select on public.canopy_demo_retirement_pools, public.canopy_demo_retirement_requests, public.canopy_demo_retirement_audit to authenticated;

drop policy if exists canopy_demo_retirement_request_read on public.canopy_demo_retirement_requests;
create policy canopy_demo_retirement_request_read on public.canopy_demo_retirement_requests for select to authenticated
  using (user_id = auth.uid() or public.canopy_is_admin());
drop policy if exists canopy_demo_retirement_audit_read on public.canopy_demo_retirement_audit;
create policy canopy_demo_retirement_audit_read on public.canopy_demo_retirement_audit for select to authenticated
  using (public.canopy_is_admin() or exists (select 1 from public.canopy_demo_retirement_requests r where r.id=retirement_request_id and r.user_id=auth.uid()));
drop policy if exists canopy_demo_retirement_pool_read on public.canopy_demo_retirement_pools;
create policy canopy_demo_retirement_pool_read on public.canopy_demo_retirement_pools for select to authenticated
  using (public.canopy_is_admin() or exists (select 1 from public.canopy_demo_retirement_requests r where r.pool_id=id and r.user_id=auth.uid()));

create or replace function public.canopy_request_demo_retirement(
  p_project_id uuid,
  p_quantity numeric,
  p_beneficiary_name text,
  p_retirement_purpose text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare
  actor uuid:=auth.uid(); held numeric(14,2); listed numeric(14,2); request_row public.canopy_demo_retirement_requests; request_key text;
begin
  if actor is null or public.canopy_is_account_active(actor) is not true
     or not exists(select 1 from public.profiles p where p.id=actor and p.role::text='sme' and p.verification_status::text='verified') then
    raise exception 'An active verified SME account is required.' using errcode='42501';
  end if;
  if p_project_id is null or p_quantity is null or p_quantity<0.01 or p_quantity*100<>trunc(p_quantity*100)
     or length(trim(coalesce(p_beneficiary_name,'')))<2 then
    raise exception 'Project, quantity, and beneficiary name must be valid.' using errcode='22023';
  end if;
  request_key:=trim(coalesce(p_idempotency_key,''));
  if length(request_key)<12 then raise exception 'A unique retirement request key is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||p_project_id::text,11));
  select * into request_row from public.canopy_demo_retirement_requests where user_id=actor and idempotency_key=request_key for update;
  if found then
    if request_row.project_id<>p_project_id or request_row.quantity_tco2e<>p_quantity then raise exception 'This request key belongs to a different retirement request.' using errcode='22023'; end if;
    return to_jsonb(request_row);
  end if;
  if not exists(select 1 from public.canopy_demo_projects where id=p_project_id and listing_active) then
    raise exception 'Demonstration project is unavailable.' using errcode='P0002';
  end if;
  select coalesce(sum(delta_tco2e),0) into held from public.canopy_demo_entitlement_ledger where user_id=actor and project_id=p_project_id;
  select coalesce(sum(quantity_tco2e),0) into listed from public.canopy_demo_trade_listings where seller_id=actor and project_id=p_project_id and status='active';
  if held-listed<p_quantity then raise exception 'Insufficient available simulated holdings after active sell listings.' using errcode='22023'; end if;
  insert into public.canopy_demo_retirement_requests(user_id,project_id,quantity_tco2e,beneficiary_name,retirement_purpose,retirement_fee_usd,statement_reference,idempotency_key)
    values(actor,p_project_id,p_quantity,trim(p_beneficiary_name),nullif(trim(coalesce(p_retirement_purpose,'')),''),round(p_quantity*.02,2),'CAN-RET-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),request_key)
    returning * into request_row;
  insert into public.canopy_demo_entitlement_ledger(user_id,project_id,event_type,delta_tco2e,retirement_request_id,actor_id,note)
    values(actor,p_project_id,'retirement_reserve',-p_quantity,request_row.id,actor,'Simulated retirement reserved pending Admin review; no real registry retirement occurred.');
  insert into public.canopy_demo_retirement_audit(retirement_request_id,actor_id,previous_status,new_status,note)
    values(request_row.id,actor,null,'requested','SME requested a simulated retirement.');
  return to_jsonb(request_row);
end;
$$;

create or replace function public.canopy_admin_review_demo_retirement(
  p_admin_id uuid,p_request_id uuid,p_decision text,p_note text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare
  request_row public.canopy_demo_retirement_requests; reserve_row public.canopy_demo_entitlement_ledger; pool_row public.canopy_demo_retirement_pools; next_status text;
begin
  if auth.uid() is distinct from p_admin_id or public.canopy_is_admin() is not true then raise exception 'Administrator access required.' using errcode='42501'; end if;
  if p_request_id is null or p_decision not in ('approve','reject') or length(trim(coalesce(p_note,'')))<3 then raise exception 'Choose approve/reject and provide an audit note of at least 3 characters.' using errcode='22023'; end if;
  select * into request_row from public.canopy_demo_retirement_requests where id=p_request_id for update;
  if not found or request_row.status not in ('requested','processing') then raise exception 'Only requested simulated retirements can be reviewed.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(request_row.user_id::text||request_row.project_id::text,11));
  select * into reserve_row from public.canopy_demo_entitlement_ledger where retirement_request_id=request_row.id and event_type='retirement_reserve' for update;
  if not found or reserve_row.user_id<>request_row.user_id or reserve_row.project_id<>request_row.project_id or reserve_row.delta_tco2e<>-request_row.quantity_tco2e then raise exception 'The simulated retirement reservation is missing or invalid.' using errcode='22023'; end if;
  if p_decision='approve' then
    if public.canopy_is_account_active(request_row.user_id) is not true or not exists(select 1 from public.profiles p where p.id=request_row.user_id and p.role::text='sme' and p.verification_status::text='verified') then
      raise exception 'The SME is no longer active and verified; reject the request to release its reserved simulated holdings.' using errcode='42501';
    end if;
    if request_row.quantity_tco2e<1 then
      perform pg_advisory_xact_lock(hashtextextended(request_row.project_id::text,19));
      select * into pool_row from public.canopy_demo_retirement_pools where project_id=request_row.project_id and status='open' and total_tco2e+request_row.quantity_tco2e<=1 order by created_at,id limit 1 for update;
      if not found then
        insert into public.canopy_demo_retirement_pools(project_id,pool_reference,total_tco2e)
          values(request_row.project_id,'CAN-POOL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),0) returning * into pool_row;
      end if;
      update public.canopy_demo_retirement_pools set total_tco2e=total_tco2e+request_row.quantity_tco2e,
        status=case when total_tco2e+request_row.quantity_tco2e=1 then 'completed' else 'open' end,
        completed_at=case when total_tco2e+request_row.quantity_tco2e=1 then now() else completed_at end
        where id=pool_row.id returning * into pool_row;
      update public.canopy_demo_retirement_requests set status='processing',pool_id=pool_row.id,reviewed_by=p_admin_id,reviewed_at=now(),review_note=trim(p_note) where id=request_row.id;
      insert into public.canopy_demo_retirement_audit(retirement_request_id,actor_id,previous_status,new_status,note) values(request_row.id,p_admin_id,'requested','processing',trim(p_note));
    end if;
    next_status:='completed';
    update public.canopy_demo_retirement_requests set status=next_status,reviewed_by=p_admin_id,reviewed_at=coalesce(reviewed_at,now()),completed_at=now(),review_note=trim(p_note) where id=request_row.id returning * into request_row;
    insert into public.canopy_demo_retirement_audit(retirement_request_id,actor_id,previous_status,new_status,note) values(request_row.id,p_admin_id,case when request_row.quantity_tco2e<1 then 'processing' else 'requested' end,'completed',trim(p_note));
  else
    insert into public.canopy_demo_entitlement_ledger(user_id,project_id,event_type,delta_tco2e,retirement_request_id,actor_id,note)
      values(request_row.user_id,request_row.project_id,'retirement_release',request_row.quantity_tco2e,request_row.id,p_admin_id,'Simulated retirement reservation released after Admin rejection.') on conflict do nothing;
    update public.canopy_demo_retirement_requests set status='rejected',reviewed_by=p_admin_id,reviewed_at=now(),review_note=trim(p_note) where id=request_row.id returning * into request_row;
    insert into public.canopy_demo_retirement_audit(retirement_request_id,actor_id,previous_status,new_status,note) values(request_row.id,p_admin_id,request_row.status,'rejected',trim(p_note));
  end if;
  return to_jsonb(request_row);
end;
$$;

create or replace function public.canopy_verify_retirement_statement(p_reference text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,auth
as $$
declare row_data jsonb;
begin
  select jsonb_build_object(
    'valid',true,'statement_reference',r.statement_reference,'company_name',p.company_name,
    'project_name',d.project_name,'quantity_tco2e',r.quantity_tco2e,
    'retirement_date',coalesce(r.completed_at,r.requested_at),'status',r.status,
    'pool_reference',pool.pool_reference,'pool_total_tco2e',pool.total_tco2e,'pool_status',pool.status,
    'pool_allocation_count',(select count(*) from public.canopy_demo_retirement_requests c where c.pool_id=r.pool_id and c.status='completed'),
    'demo_only',true
  ) into row_data
  from public.canopy_demo_retirement_requests r
  join public.profiles p on p.id=r.user_id
  join public.canopy_demo_projects d on d.id=r.project_id
  left join public.canopy_demo_retirement_pools pool on pool.id=r.pool_id
  where r.statement_reference=upper(trim(coalesce(p_reference,'')));
  return coalesce(row_data,jsonb_build_object('valid',false,'status','invalid','demo_only',true));
end;
$$;

revoke all on function public.canopy_request_demo_retirement(uuid,numeric,text,text,text), public.canopy_admin_review_demo_retirement(uuid,uuid,text,text), public.canopy_verify_retirement_statement(text) from public,anon;
grant execute on function public.canopy_request_demo_retirement(uuid,numeric,text,text,text), public.canopy_admin_review_demo_retirement(uuid,uuid,text,text) to authenticated;
grant execute on function public.canopy_verify_retirement_statement(text) to anon,authenticated;

commit;