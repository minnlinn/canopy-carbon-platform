-- Partner reporting extension. Run only after migrations 001–008.
-- It exposes no client data unless the authenticated, subscribed Partner has active SME consent.

begin;

do $$
begin
  if to_regclass('public.canopy_demo_projects') is null
     or to_regclass('public.canopy_demo_purchase_requests') is null
     or to_regclass('public.canopy_demo_entitlement_ledger') is null
     or to_regclass('public.canopy_report_requests') is null
     or to_regprocedure('public.canopy_partner_can_access_sme(uuid)') is null then
    raise exception 'Apply Canopy migrations 001–008 before Partner demo reporting.';
  end if;
end;
$$;

-- Do not reveal individual referral records or organisation names without consent.
create or replace function public.canopy_partner_clients()
returns table(sme_id uuid,company_name text,verification_status text,consent_granted boolean,referral_created_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  -- The retained referral_created_at output name carries consent-granted time here.
  return query
    select c.sme_id,p.company_name::text,p.verification_status::text,true,c.granted_at
    from public.canopy_partner_client_consents c
    join public.profiles p on p.id=c.sme_id
    where c.partner_id=auth.uid()
      and public.canopy_partner_can_access_sme(c.sme_id)
    order by c.granted_at desc;
end;
$$;

create or replace function public.canopy_partner_client_data(p_sme_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  holdings_json jsonb;
  requests_json jsonb;
  profile_json jsonb;
  demo_holdings_json jsonb;
  demo_purchases_json jsonb;
  retirements_json jsonb;
  reports_json jsonb;
begin
  if public.canopy_partner_can_access_sme(p_sme_id) is not true then
    raise exception 'SME has not authorized Partner data access.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'company_name',p.company_name,
    'registration_number',p.registration_number,
    'sector',p.sector,
    'verification_status',p.verification_status
  ) into profile_json from public.profiles p where p.id=p_sme_id;

  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb)
    into holdings_json
    from public.holdings h left join public.projects pr on pr.id=h.project_id
    where h.owner_id=p_sme_id;

  select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('project',to_jsonb(pr))),'[]'::jsonb)
    into requests_json
    from public.carbon_requests r left join public.projects pr on pr.id=r.project_id
    where r.requester_id=p_sme_id or r.recipient_id=p_sme_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'project_id',x.project_id,'project_name',x.project_name,
    'registry_reference',x.registry_reference,'quantity_tco2e',x.quantity_tco2e
  ) order by x.project_name),'[]'::jsonb)
    into demo_holdings_json
    from (
      select l.project_id,d.project_name,(d.registry_name || ' ' || d.registry_project_id) as registry_reference,
        sum(l.delta_tco2e) as quantity_tco2e
      from public.canopy_demo_entitlement_ledger l
      join public.canopy_demo_projects d on d.id=l.project_id
      where l.user_id=p_sme_id
      group by l.project_id,d.project_name,d.registry_name,d.registry_project_id
      having sum(l.delta_tco2e) > 0
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'created_at',r.created_at,'project_name',d.project_name,'quantity_tco2e',r.quantity_tco2e,
    'simulated_total_myr',r.simulated_total_myr,'request_status',r.request_status
  ) order by r.created_at desc),'[]'::jsonb)
    into demo_purchases_json
    from public.canopy_demo_purchase_requests r
    join public.canopy_demo_projects d on d.id=r.project_id
    where r.user_id=p_sme_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'created_at',r.created_at,'request_type',r.request_type,'quantity_tco2e',r.quantity_tco2e,
    'status',r.status,'project_name',coalesce(pr.name,r.project_id::text)
  ) order by r.created_at desc),'[]'::jsonb)
    into retirements_json
    from public.carbon_requests r
    left join public.projects pr on pr.id=r.project_id
    where (r.requester_id=p_sme_id or r.recipient_id=p_sme_id)
      and lower(r.request_type::text) in ('retire','retirement');

  select coalesce(jsonb_agg(jsonb_build_object(
    'created_at',rr.created_at,'period_start',rr.period_start,'period_end',rr.period_end,'status',rr.status
  ) order by rr.created_at desc),'[]'::jsonb)
    into reports_json
    from public.canopy_report_requests rr
    where rr.user_id=p_sme_id and rr.status in ('ready','ready_demo');

  return jsonb_build_object(
    'profile',coalesce(profile_json,'{}'::jsonb),
    'holdings',coalesce(holdings_json,'[]'::jsonb),
    'requests',coalesce(requests_json,'[]'::jsonb),
    'demo_holdings',coalesce(demo_holdings_json,'[]'::jsonb),
    'demo_purchases',coalesce(demo_purchases_json,'[]'::jsonb),
    'retirements',coalesce(retirements_json,'[]'::jsonb),
    'reports',coalesce(reports_json,'[]'::jsonb),
    'demo_only',true
  );
end;
$$;

revoke all on function public.canopy_partner_clients() from public, anon;
grant execute on function public.canopy_partner_clients() to authenticated;
revoke all on function public.canopy_partner_client_data(uuid) from public, anon;
grant execute on function public.canopy_partner_client_data(uuid) to authenticated;

commit;
