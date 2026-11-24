-- Veritas MUN Database Schema, RLS Policies, Triggers & Seed Content
-- Run this script once in the Supabase SQL Editor (Dashboard -> SQL Editor).

create extension if not exists pgcrypto;

-- 1. TABLES

create table if not exists public.roster (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null unique check (email = lower(trim(email)) and position('@' in email) > 1),
  phone text not null default '',
  department text not null default '',
  position text not null default 'Member',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  roster_id uuid unique references public.roster(id) on delete set null,
  email text not null default '',
  full_name text not null,
  department text not null default '',
  position text not null default 'Member',
  role text not null default 'member' check (role in ('member', 'head', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Separate admin-only drafts table so unpublished edits are never readable by the public
create table if not exists public.site_content_drafts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_cards (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  title text not null check (length(trim(title)) > 0),
  photo_url text not null default '',
  sort_order integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null default '',
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  body text not null check (length(trim(body)) > 0),
  audience text not null check (audience in ('all', 'department', 'heads')),
  target_department text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_roster_email on public.roster (email);
create index if not exists idx_roster_department on public.roster (department);
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_profiles_roster_id on public.profiles (roster_id);
create index if not exists idx_team_cards_order on public.team_cards (sort_order, created_at);
create index if not exists idx_audit_log_created on public.audit_log (created_at desc);
create index if not exists idx_announcements_created on public.announcements (created_at desc);

-- 2. NORMALIZATION & HELPER FUNCTIONS

create or replace function public.normalize_roster_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists trg_normalize_roster_email on public.roster;
create trigger trg_normalize_roster_email
before insert or update on public.roster
for each row execute function public.normalize_roster_email();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_site_content on public.site_content;
create trigger trg_touch_site_content
before update on public.site_content
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_site_content_drafts on public.site_content_drafts;
create trigger trg_touch_site_content_drafts
before update on public.site_content_drafts
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_team_cards on public.team_cards;
create trigger trg_touch_team_cards
before update on public.team_cards
for each row execute function public.touch_updated_at();

-- SECURITY DEFINER helpers avoid infinite RLS recursion when querying profiles
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active = true
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
  );
$$;

create or replace function public.is_head_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('head', 'admin')
      and active = true
  );
$$;

create or replace function public.current_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1;
$$;

-- Guard against role/active escalation or non-admin profile mutation
create or replace function public.prevent_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.active is distinct from old.active or new.roster_id is distinct from old.roster_id then
      raise exception 'Only administrators can modify account roles or status.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_self_escalation on public.profiles;
create trigger trg_prevent_profile_self_escalation
before update on public.profiles
for each row execute function public.prevent_profile_self_escalation();

-- 3. SIGN-UP GATEKEEPING & AUTO-PROFILE TRIGGERS ON auth.users

create or replace function public.enforce_roster_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
begin
  if new.email is null then
    raise exception 'This email isn''t on the team list. Contact an admin.' using errcode = 'P0001';
  end if;

  normalized_email := lower(trim(new.email));

  if not exists (
    select 1
    from public.roster
    where lower(email) = normalized_email
  ) then
    raise exception 'This email isn''t on the team list. Contact an admin.' using errcode = 'P0001';
  end if;

  new.email := normalized_email;
  return new;
end;
$$;

drop trigger if exists trg_enforce_roster_on_signup on auth.users;
create trigger trg_enforce_roster_on_signup
before insert on auth.users
for each row execute function public.enforce_roster_on_signup();

create or replace function public.handle_new_roster_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matched_roster public.roster%rowtype;
  assigned_role text;
begin
  select *
  into matched_roster
  from public.roster
  where lower(email) = lower(trim(new.email))
  limit 1;

  if not found then
    raise exception 'This email isn''t on the team list. Contact an admin.' using errcode = 'P0001';
  end if;

  if position('head' in lower(coalesce(matched_roster.position, ''))) > 0 then
    assigned_role := 'head';
  else
    assigned_role := 'member';
  end if;

  insert into public.profiles (
    id,
    roster_id,
    email,
    full_name,
    department,
    position,
    role,
    active
  )
  values (
    new.id,
    matched_roster.id,
    lower(trim(new.email)),
    matched_roster.full_name,
    matched_roster.department,
    matched_roster.position,
    assigned_role,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_roster_user on auth.users;
create trigger trg_handle_new_roster_user
after insert on auth.users
for each row execute function public.handle_new_roster_user();

-- 4. ROW LEVEL SECURITY (RLS)

alter table public.roster enable row level security;
alter table public.profiles enable row level security;
alter table public.site_content enable row level security;
alter table public.site_content_drafts enable row level security;
alter table public.team_cards enable row level security;
alter table public.audit_log enable row level security;
alter table public.announcements enable row level security;

-- ROSTER: strictly admin only (0 access for anon & non-admin members)
drop policy if exists "roster_admin_select" on public.roster;
create policy "roster_admin_select" on public.roster
  for select to authenticated using (public.is_admin());

drop policy if exists "roster_admin_insert" on public.roster;
create policy "roster_admin_insert" on public.roster
  for insert to authenticated with check (public.is_admin());

drop policy if exists "roster_admin_update" on public.roster;
create policy "roster_admin_update" on public.roster
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "roster_admin_delete" on public.roster;
create policy "roster_admin_delete" on public.roster
  for delete to authenticated using (public.is_admin());

-- PROFILES: members read only their own profile; admins manage all profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles
  for delete to authenticated using (public.is_admin());

-- SITE CONTENT (published): public read, admin write
drop policy if exists "site_content_public_read" on public.site_content;
create policy "site_content_public_read" on public.site_content
  for select to anon, authenticated using (true);

drop policy if exists "site_content_admin_insert" on public.site_content;
create policy "site_content_admin_insert" on public.site_content
  for insert to authenticated with check (public.is_admin());

drop policy if exists "site_content_admin_update" on public.site_content;
create policy "site_content_admin_update" on public.site_content
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "site_content_admin_delete" on public.site_content;
create policy "site_content_admin_delete" on public.site_content
  for delete to authenticated using (public.is_admin());

-- SITE CONTENT DRAFTS: strictly admin only
drop policy if exists "site_content_drafts_admin_all" on public.site_content_drafts;
create policy "site_content_drafts_admin_all" on public.site_content_drafts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- TEAM CARDS: public reads only visible cards; admins see and manage all cards
drop policy if exists "team_cards_public_read_visible" on public.team_cards;
create policy "team_cards_public_read_visible" on public.team_cards
  for select to anon, authenticated
  using (visible = true or public.is_admin());

drop policy if exists "team_cards_admin_insert" on public.team_cards;
create policy "team_cards_admin_insert" on public.team_cards
  for insert to authenticated with check (public.is_admin());

drop policy if exists "team_cards_admin_update" on public.team_cards;
create policy "team_cards_admin_update" on public.team_cards
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team_cards_admin_delete" on public.team_cards;
create policy "team_cards_admin_delete" on public.team_cards
  for delete to authenticated using (public.is_admin());

-- AUDIT LOG: append-only by admins, read-only by admins
drop policy if exists "audit_log_admin_select" on public.audit_log;
create policy "audit_log_admin_select" on public.audit_log
  for select to authenticated using (public.is_admin());

drop policy if exists "audit_log_admin_insert" on public.audit_log;
create policy "audit_log_admin_insert" on public.audit_log
  for insert to authenticated with check (public.is_admin());

-- ANNOUNCEMENTS: active members read announcements addressed to them; admins manage all
drop policy if exists "announcements_member_read" on public.announcements;
create policy "announcements_member_read" on public.announcements
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_member()
      and (
        audience = 'all'
        or (audience = 'heads' and public.is_head_or_admin())
        or (
          audience = 'department'
          and coalesce(trim(target_department), '') <> ''
          and lower(trim(target_department)) = lower(trim(coalesce(public.current_department(), '')))
        )
      )
    )
  );

drop policy if exists "announcements_admin_insert" on public.announcements;
create policy "announcements_admin_insert" on public.announcements
  for insert to authenticated with check (public.is_admin());

drop policy if exists "announcements_admin_update" on public.announcements;
create policy "announcements_admin_update" on public.announcements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "announcements_admin_delete" on public.announcements;
create policy "announcements_admin_delete" on public.announcements
  for delete to authenticated using (public.is_admin());

-- 5. SUPABASE STORAGE BUCKET FOR TEAM PHOTOS

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-photos',
  'team-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "team_photos_public_read" on storage.objects;
create policy "team_photos_public_read" on storage.objects
  for select to public
  using (bucket_id = 'team-photos');

drop policy if exists "team_photos_admin_insert" on storage.objects;
create policy "team_photos_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-photos' and public.is_admin());

drop policy if exists "team_photos_admin_update" on storage.objects;
create policy "team_photos_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'team-photos' and public.is_admin())
  with check (bucket_id = 'team-photos' and public.is_admin());

drop policy if exists "team_photos_admin_delete" on storage.objects;
create policy "team_photos_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-photos' and public.is_admin());

-- 6. SEED INITIAL PUBLIC CONTENT & EXISTING SECRETARIAT CARDS (NO PII)

insert into public.site_content (key, value)
values
  ('hero', '{"title": "VERITAS MUN", "tagline": "Where diplomacy meets truth", "ctaLabel": "Register"}'::jsonb),
  ('about', '{"paragraphs": ["Veritas MUN is a Model United Nations conference built around careful research and direct debate.", "Delegates represent assigned portfolios, draft working papers, and take part in committee sessions."]}'::jsonb),
  ('committees', '{"showTba": true, "tbaSubtitle": "To be announced.", "items": []}'::jsonb),
  ('schedule', '{"showTba": true, "tbaSubtitle": "To be announced.", "items": []}'::jsonb),
  ('faq', '{"showTba": true, "tbaSubtitle": "To be announced.", "items": []}'::jsonb),
  ('register', '{"showTba": true, "tbaSubtitle": "To be announced.", "items": []}'::jsonb),
  ('settings', '{"site_name": "Veritas MUN", "registration_open": false, "contact_email": ""}'::jsonb)
on conflict (key) do nothing;

insert into public.site_content_drafts (key, value)
select key, value from public.site_content
on conflict (key) do nothing;

insert into public.team_cards (full_name, title, photo_url, sort_order, visible)
select 'Laila Mohammad', 'Secretary-General', '/assets/aistudio/WhatsApp_Image_2026-11-22_at_9.00.13_AM__1__294445e1.jpeg', 0, true
where not exists (select 1 from public.team_cards);

insert into public.team_cards (full_name, title, photo_url, sort_order, visible)
select 'Zain Rawashdeh', 'Under-Secretary-General', '/assets/aistudio/WhatsApp_Image_2026-11-03_at_9.48.11_AM__2__b371837c.jpeg', 1, true
where (select count(*) from public.team_cards) = 1;

insert into public.team_cards (full_name, title, photo_url, sort_order, visible)
select 'Laya Shahwan', 'Deputy Secretary-General', '/assets/aistudio/WhatsApp_Image_2026-10-21_at_5.27.20_PM__3__1145c352.jpeg', 2, true
where (select count(*) from public.team_cards) = 2;

-- 7. ONE-TIME FIRST ADMIN PROMOTION
-- After adding your own email to `roster`, signing up at `/signup`, and verifying your email,
-- run this statement once with your email address to grant admin access:
--
-- update public.profiles
-- set role = 'admin'
-- where lower(email) = lower('admin@example.com');
