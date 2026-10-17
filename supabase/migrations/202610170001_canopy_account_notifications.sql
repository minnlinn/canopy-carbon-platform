do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Canopy account notifications require the existing public.profiles table.';
  end if;
  if to_regtype('public.user_role') is null or to_regtype('public.verification_status') is null then
    raise exception 'Canopy account notifications require the existing public.user_role and public.verification_status enum types.';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid='public.profiles'::regclass and attname='id' and not attisdropped and atttypid='uuid'::regtype
  ) or not exists (
    select 1 from pg_attribute
    where attrelid='public.profiles'::regclass and attname='role' and not attisdropped and atttypid='public.user_role'::regtype
  ) or not exists (
    select 1 from pg_attribute
    where attrelid='public.profiles'::regclass and attname='verification_status' and not attisdropped and atttypid='public.verification_status'::regtype
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='review_note'
  ) then
    raise exception 'Existing public.profiles columns do not match the Canopy account contract.';
  end if;
  if not exists (select 1 from pg_enum where enumtypid='public.user_role'::regtype and enumlabel='sme')
     or not exists (select 1 from pg_enum where enumtypid='public.user_role'::regtype and enumlabel='partner')
     or not exists (select 1 from pg_enum where enumtypid='public.user_role'::regtype and enumlabel='admin')
     or not exists (select 1 from pg_enum where enumtypid='public.verification_status'::regtype and enumlabel='pending')
     or not exists (select 1 from pg_enum where enumtypid='public.verification_status'::regtype and enumlabel='verified') then
    raise exception 'Canopy account notifications require SME, Partner, Admin, pending and verified enum values.';
  end if;
end;
$$;

alter table public.profiles
  alter column verification_status set default 'pending';

create table if not exists public.canopy_email_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('registration_welcome', 'account_verified')),
  recipient text not null,
  created_at timestamptz not null default now(),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  unique (user_id, notification_type)
);

alter table public.canopy_email_notifications enable row level security;
revoke all on public.canopy_email_notifications from anon, authenticated;
grant all on public.canopy_email_notifications to service_role;

create or replace function public.canopy_prepare_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.role := 'sme';
    new.verification_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists canopy_prepare_profile_before_insert on public.profiles;
create trigger canopy_prepare_profile_before_insert
before insert on public.profiles
for each row execute function public.canopy_prepare_profile();

create or replace function public.canopy_protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role'
     and (new.role is distinct from old.role
       or new.verification_status is distinct from old.verification_status) then
    raise exception 'Role and verification status can only be changed by trusted server actions.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists canopy_protect_profile_security_fields_before_update on public.profiles;
create trigger canopy_protect_profile_security_fields_before_update
before update on public.profiles
for each row execute function public.canopy_protect_profile_security_fields();

create or replace function public.canopy_queue_registration_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  profile_email text;
begin
  if new.role::text in ('sme', 'partner')
     and new.verification_status::text = 'pending' then
    select users.email into profile_email
    from auth.users as users
    where users.id = new.id;

    if profile_email is not null then
      insert into public.canopy_email_notifications (user_id, notification_type, recipient)
      values (new.id, 'registration_welcome', profile_email)
      on conflict (user_id, notification_type) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists canopy_queue_registration_notification_after_insert on public.profiles;
create trigger canopy_queue_registration_notification_after_insert
after insert on public.profiles
for each row execute function public.canopy_queue_registration_notification();

create or replace function public.canopy_approve_profile(p_profile_id uuid, p_review_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  target_role text;
  target_status text;
  target_email text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server action required.' using errcode = '42501';
  end if;

  select profiles.role::text, profiles.verification_status::text, users.email
    into target_role, target_status, target_email
  from public.profiles as profiles
  join auth.users as users on users.id = profiles.id
  where profiles.id = p_profile_id
  for update of profiles;

  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  if target_role not in ('sme', 'partner') then
    raise exception 'Only SME or Partner accounts can be verified.' using errcode = '22023';
  end if;
  if target_status <> 'pending' then
    raise exception 'Account is not pending verification.' using errcode = '22023';
  end if;
  if target_email is null then
    raise exception 'Account email is unavailable.' using errcode = '22023';
  end if;

  update public.profiles
  set verification_status = 'verified',
      review_note = coalesce(nullif(trim(p_review_note), ''), 'Verified by Canopy administrator.')
  where id = p_profile_id;

  insert into public.canopy_email_notifications (user_id, notification_type, recipient)
  values (p_profile_id, 'account_verified', target_email)
  on conflict (user_id, notification_type) do nothing;

  return jsonb_build_object('profile_id', p_profile_id, 'verification_status', 'verified');
end;
$$;

create or replace function public.canopy_claim_email_notification(p_notification_id uuid)
returns setof public.canopy_email_notifications
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Trusted server action required.' using errcode = '42501';
  end if;

  return query
  update public.canopy_email_notifications
  set delivery_status = 'sending', attempts = attempts + 1, last_error = null
  where id = p_notification_id and delivery_status = 'pending'
  returning *;
end;
$$;

revoke all on function public.canopy_approve_profile(uuid, text) from public, anon, authenticated;
revoke all on function public.canopy_claim_email_notification(uuid) from public, anon, authenticated;
grant execute on function public.canopy_approve_profile(uuid, text) to service_role;
grant execute on function public.canopy_claim_email_notification(uuid) to service_role;
