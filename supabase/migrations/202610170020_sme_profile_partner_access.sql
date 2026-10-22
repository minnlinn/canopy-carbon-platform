-- Optional SME business details and referral-partner display data. Apply after 001-019.
alter table public.profiles add column if not exists company_description text;
alter table public.profiles add column if not exists business_address text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles add column if not exists business_phone text;

create or replace function public.canopy_update_sme_profile(p_description text,p_address text,p_website text,p_contact_name text,p_contact_email text,p_phone text,p_sector text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid(); row_data public.profiles;
begin
 if actor is null or public.canopy_is_account_active(actor) is not true or not exists(select 1 from public.profiles where id=actor and role::text='sme') then raise exception 'An active SME account is required.' using errcode='42501'; end if;
 if length(trim(coalesce(p_description,'')))>2000 or length(trim(coalesce(p_address,'')))>500 or length(trim(coalesce(p_contact_name,'')))>160 or length(trim(coalesce(p_phone,'')))>50 or length(trim(coalesce(p_sector,'')))>160 then raise exception 'One or more profile fields are too long.' using errcode='22023'; end if;
 if nullif(trim(coalesce(p_contact_email,'')),'') is not null and trim(p_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid contact email.' using errcode='22023'; end if;
 if nullif(trim(coalesce(p_website,'')),'') is not null and trim(p_website) !~* '^https://[^[:space:]]+$' then raise exception 'Website must use a valid HTTPS URL.' using errcode='22023'; end if;
 update public.profiles set company_description=nullif(trim(coalesce(p_description,'')),''),business_address=nullif(trim(coalesce(p_address,'')),''),website=nullif(trim(coalesce(p_website,'')),''),contact_name=nullif(trim(coalesce(p_contact_name,'')),''),contact_email=nullif(lower(trim(coalesce(p_contact_email,''))),''),business_phone=nullif(trim(coalesce(p_phone,'')),''),sector=nullif(trim(coalesce(p_sector,'')),'') where id=actor returning * into row_data;
 return jsonb_build_object('company_description',row_data.company_description,'business_address',row_data.business_address,'website',row_data.website,'contact_name',row_data.contact_name,'contact_email',row_data.contact_email,'business_phone',row_data.business_phone,'sector',row_data.sector);
end $$;

create or replace function public.canopy_sme_partner_access()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or public.canopy_is_account_active(actor) is not true or not exists(select 1 from public.profiles where id=actor and role::text='sme') then raise exception 'An active SME account is required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('partner_id',r.partner_id,'partner_name',p.company_name,'contact_name',p.contact_name,'contact_email',p.contact_email,'business_phone',p.business_phone,'website',p.website,'referral_code',r.code,'profile_granted',(pc.granted_at is not null and pc.revoked_at is null),'full_granted',(cc.granted_at is not null and cc.revoked_at is null)) order by r.created_at desc) from public.canopy_partner_referrals r join public.profiles p on p.id=r.partner_id left join public.canopy_partner_profile_consents pc on pc.partner_id=r.partner_id and pc.sme_id=actor left join public.canopy_partner_client_consents cc on cc.partner_id=r.partner_id and cc.sme_id=actor where r.sme_id=actor),'[]'::jsonb);
end $$;
revoke all on function public.canopy_update_sme_profile(text,text,text,text,text,text,text),public.canopy_sme_partner_access() from public,anon;
grant execute on function public.canopy_update_sme_profile(text,text,text,text,text,text,text),public.canopy_sme_partner_access() to authenticated;
