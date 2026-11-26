-- Veritas MUN: Committees Table, Committee Logo Storage, & Independent Application Settings Migration
-- Run this script once in the Supabase SQL Editor (Dashboard -> SQL Editor).

-- 1. COMMITTEES TABLE
create table if not exists public.committees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  image_url text not null default '',
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_committees_sort_order
  on public.committees (sort_order asc, created_at asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_committees_updated_at on public.committees;
create trigger trg_committees_updated_at
before update on public.committees
for each row execute function public.set_updated_at();

alter table public.committees enable row level security;

drop policy if exists "committees_public_read_enabled" on public.committees;
create policy "committees_public_read_enabled" on public.committees
  for select to anon, authenticated
  using (enabled = true or public.is_admin());

drop policy if exists "committees_admin_insert" on public.committees;
create policy "committees_admin_insert" on public.committees
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "committees_admin_update" on public.committees;
create policy "committees_admin_update" on public.committees
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "committees_admin_delete" on public.committees;
create policy "committees_admin_delete" on public.committees
  for delete to authenticated
  using (public.is_admin());

-- 2. EXPAND PUBLIC ASSET BUCKET ('team-photos') TO ALLOW COMMITTEE LOGOS UP TO 5 MB
update storage.buckets
set
  file_size_limit = greatest(coalesce(file_size_limit, 2097152), 5242880),
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'team-photos';

-- 3. SEED INDEPENDENT APPLICATION SETTINGS IN SITE_CONTENT (IDEMPOTENT)
insert into public.site_content (key, value)
values (
  'application_settings',
  '{
    "description": "Applications for Veritas MUN departments are managed below. Select an open track to submit your experience and supporting proof.",
    "volunteer": {
      "open": true,
      "visible": true,
      "button_text": "Apply as Volunteer"
    },
    "security": {
      "open": true,
      "visible": true,
      "button_text": "Apply as Security"
    }
  }'::jsonb
)
on conflict (key) do nothing;

-- 4. SERVER-SIDE ENFORCEMENT FOR CLOSED APPLICATION TRACKS
create or replace function public.is_application_track_open(target_track text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  norm_track text;
  track_key text;
  open_val text;
begin
  norm_track := lower(trim(coalesce(target_track, '')));
  if norm_track = 'volunteers' then
    track_key := 'volunteer';
  elsif norm_track = 'security' then
    track_key := 'security';
  else
    return false;
  end if;

  select value into cfg
  from public.site_content
  where key = 'application_settings'
  limit 1;

  if cfg is null then
    return true;
  end if;

  open_val := cfg -> track_key ->> 'open';
  if open_val is null then
    return true;
  end if;

  return lower(open_val) = 'true';
end;
$$;

drop policy if exists "applications_public_insert" on public.applications;
create policy "applications_public_insert" on public.applications
  for insert to anon, authenticated
  with check (public.is_application_track_open(track));
