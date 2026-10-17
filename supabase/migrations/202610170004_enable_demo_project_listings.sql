-- Canopy demonstration listings only. Run this after migrations 001, 002 and 003.
-- This does not create, acquire, transfer, retire, or claim ownership of real carbon credits.
-- It only enables simulated university-presentation values for the four public registry references.

do $$
begin
  if to_regclass('public.canopy_demo_projects') is null then
    raise exception 'Apply 202610170003_demo_projects_and_partner_registration.sql before this file.';
  end if;
end;
$$;

update public.canopy_demo_projects
set simulated_price_myr = case registry_project_id
      when '2609' then 52.00
      when '672' then 46.00
      when '4279' then 38.00
      when '5542' then 34.00
    end,
    simulated_inventory_tco2e = case registry_project_id
      when '2609' then 250.00
      when '672' then 180.00
      when '4279' then 320.00
      when '5542' then 400.00
    end,
    demo_trading_enabled = true,
    updated_at = now()
where registry_name = 'Verra VCS'
  and registry_project_id in ('2609', '672', '4279', '5542');

do $$
begin
  if (select count(*) from public.canopy_demo_projects
      where registry_name = 'Verra VCS'
        and registry_project_id in ('2609', '672', '4279', '5542')
        and demo_trading_enabled
        and simulated_price_myr > 0
        and simulated_inventory_tco2e >= 0.01) <> 4 then
    raise exception 'All four demonstration project records must exist before enabling simulated purchases.';
  end if;
end;
$$;
