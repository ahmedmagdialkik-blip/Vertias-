-- Veritas MUN: Core Governance, Departments, Granular Permissions, Notifications & Security Events
-- Migration 006 (additive, idempotent; preserves all existing users, passwords, roster & RLS)

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 1. DEPARTMENTS TABLE
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(trim(slug)) and length(trim(slug)) > 0),
  name text not null unique check (length(trim(name)) > 0),
  category text not null default 'operations' check (category in ('secretariat', 'operations', 'applications', 'conference')),
  description text not null default '',
  registration_open boolean not null default false,
  head_review_enabled boolean not null default true,
  section_required boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

insert into public.departments (slug, name, category, description, registration_open, head_review_enabled, section_required, sort_order)
values
  ('secretaries', 'Secretaries', 'secretariat', 'Secretariat executive leadership and final conference governance.', false, false, false, 1),
  ('it', 'IT', 'secretariat', 'Information technology infrastructure, portal administration, and technical operations.', false, false, false, 2),
  ('security', 'Security', 'applications', 'Conference safety, floor monitoring, delegate conduct, and QR gate operations.', true, true, true, 3),
  ('volunteers', 'Volunteers', 'applications', 'Session logistics, delegate assistance, runner coordination, and committee hall support.', true, true, false, 4),
  ('hr', 'HR', 'operations', 'Staff onboarding, accepted applicant invitations, attendance coordination, and team welfare.', false, true, false, 5),
  ('media', 'Media', 'conference', 'Photography, videography, conference coverage, and recap production.', false, true, false, 6),
  ('press', 'Press', 'conference', 'Conference journalism, dispatches, interviews, and delegate gazette.', false, true, false, 7),
  ('pr', 'PR', 'conference', 'Public relations, school outreach, and external delegations.', false, true, false, 8),
  ('dcc', 'DCC', 'conference', 'Delegate & Chair coordination and committee academic readiness.', false, true, false, 9),
  ('design', 'Design', 'conference', 'Visual identity, badges, stage graphics, and conference publications.', false, true, false, 10),
  ('marketing', 'Marketing', 'conference', 'Campaign planning, social media publishing, and brand reach.', false, true, false, 11),
  ('logistics', 'Logistics', 'operations', 'Venue preparation, placard distribution, supplies, and room setup.', false, true, false, 12),
  ('ceremonies', 'Ceremonies', 'conference', 'Opening & closing ceremonies, protocol, and guest coordination.', false, true, false, 13)
on conflict (slug) do nothing;

alter table public.departments enable row level security;

drop policy if exists "departments_public_read_active" on public.departments;
create policy "departments_public_read_active" on public.departments
  for select to anon, authenticated
  using (active = true or public.is_admin());

drop policy if exists "departments_admin_write" on public.departments;
create policy "departments_admin_write" on public.departments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2. NON-DESTRUCTIVE PROFILES EXTENSIONS (Preserves 'member' | 'head' | 'admin' + existing accounts/passwords)
alter table public.profiles add column if not exists section text not null default '';
alter table public.profiles add column if not exists eb_rank text not null default 'member';
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists suspended_reason text not null default '';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_section_check'
  ) then
    alter table public.profiles
      add constraint profiles_section_check
      check (section in ('', 'Male', 'Female', 'male', 'female'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_eb_rank_check'
  ) then
    alter table public.profiles
      add constraint profiles_eb_rank_check
      check (eb_rank in ('member', 'co_head', 'head', 'executive'));
  end if;
end $$;

drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles
before update on public.profiles
for each row execute function public.set_updated_at();

-- Backfill eb_rank cleanly for existing admins/heads without altering roles or active flags
update public.profiles
set eb_rank = case
  when role = 'admin' and lower(coalesce(position, '')) like '%co-head%' then 'co_head'
  when role = 'admin' and lower(coalesce(position, '')) like '%head%' then 'head'
  when role = 'admin' then 'executive'
  when role = 'head' and lower(coalesce(position, '')) like '%co-head%' then 'co_head'
  when role = 'head' then 'head'
  else eb_rank
end
where eb_rank = 'member' and (role in ('admin', 'head'));

-- Enforce strict anti-escalation for all privileged columns on profiles
create or replace function public.prevent_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.roster_id is distinct from old.roster_id
       or new.permissions is distinct from old.permissions
       or new.eb_rank is distinct from old.eb_rank
       or new.department is distinct from old.department
       or new.position is distinct from old.position
       or new.suspended_reason is distinct from old.suspended_reason then
      raise exception 'Only administrators can modify account roles, permissions, department, or status.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_self_escalation on public.profiles;
create trigger trg_prevent_profile_self_escalation
before update on public.profiles
for each row execute function public.prevent_profile_self_escalation();

-- 3. FINE-GRAINED AUTHORIZATION HELPERS (SECURITY DEFINER, NO RECURSIVE RLS)
create or replace function public.has_permission(perm_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'admin'
        or lower(coalesce(p.permissions ->> perm_key, 'false')) = 'true'
      )
  );
$$;

create or replace function public.is_hr_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'admin'
        or (p.role = 'head' and lower(coalesce(p.department, '')) ~ '(^|[^a-z])hr([^a-z]|$)|human resources')
        or lower(coalesce(p.permissions ->> 'hr_invites', 'false')) = 'true'
      )
  );
$$;

create or replace function public.is_qr_scanner_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'admin'
        or lower(coalesce(p.department, '')) like '%security%'
        or lower(coalesce(p.permissions ->> 'qr_scanner', 'false')) = 'true'
      )
  );
$$;

create or replace function public.is_email_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'admin'
        or lower(coalesce(p.permissions ->> 'email_manage', 'false')) = 'true'
        or (p.role = 'head' and lower(coalesce(p.department, '')) ~ '(^|[^a-z])hr([^a-z]|$)|human resources')
      )
  );
$$;

create or replace function public.is_cms_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and (
        p.role = 'admin'
        or lower(coalesce(p.permissions ->> 'cms_manage', 'false')) = 'true'
      )
  );
$$;

revoke all on function public.has_permission(text) from public, anon;
revoke all on function public.is_hr_authorized() from public, anon;
revoke all on function public.is_qr_scanner_authorized() from public, anon;
revoke all on function public.is_email_authorized() from public, anon;
revoke all on function public.is_cms_authorized() from public, anon;

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_hr_authorized() to authenticated;
grant execute on function public.is_qr_scanner_authorized() to authenticated;
grant execute on function public.is_email_authorized() to authenticated;
grant execute on function public.is_cms_authorized() to authenticated;

-- 4. AUTHORITATIVE POSTGRES NOTIFICATIONS TABLE
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  target_role text not null default 'all' check (target_role in ('all', 'member', 'head', 'admin')),
  target_department text not null default '',
  kind text not null default 'info' check (kind in ('info', 'application', 'invite', 'qr', 'shift', 'task', 'security', 'announcement')),
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  link_section text not null default '',
  entity_id uuid,
  read_by jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_created on public.notifications (created_at desc);
create index if not exists idx_notifications_recipient on public.notifications (recipient_user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_member_read" on public.notifications;
create policy "notifications_member_read" on public.notifications
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_active_member()
      and (
        recipient_user_id = auth.uid()
        or (
          recipient_user_id is null
          and (
            target_role = 'all'
            or (target_role = 'head' and public.is_head_or_admin())
            or (
              coalesce(trim(target_department), '') <> ''
              and lower(trim(target_department)) = lower(trim(coalesce(public.current_department(), '')))
            )
          )
        )
      )
    )
  );

drop policy if exists "notifications_admin_or_head_insert" on public.notifications;
create policy "notifications_admin_or_head_insert" on public.notifications
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and lower(trim(coalesce(target_department, ''))) = lower(trim(coalesce(public.current_department(), '')))
    )
  );

drop policy if exists "notifications_admin_delete" on public.notifications;
create policy "notifications_admin_delete" on public.notifications
  for delete to authenticated
  using (public.is_admin());

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid_text text;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Authentication required.';
  end if;
  uid_text := auth.uid()::text;

  update public.notifications
  set read_by = case
    when read_by @> jsonb_build_array(uid_text) then read_by
    else read_by || jsonb_build_array(uid_text)
  end
  where id = p_notification_id
    and (
      public.is_admin()
      or recipient_user_id = auth.uid()
      or (
        recipient_user_id is null
        and (
          target_role = 'all'
          or (target_role = 'head' and public.is_head_or_admin())
          or (
            coalesce(trim(target_department), '') <> ''
            and lower(trim(target_department)) = lower(trim(coalesce(public.current_department(), '')))
          )
        )
      )
    );
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- 5. IMMUTABLE SECURITY EVENTS LOG
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  event_type text not null check (length(trim(event_type)) > 0),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  summary text not null check (length(trim(summary)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_created on public.security_events (created_at desc);
create index if not exists idx_security_events_severity on public.security_events (severity, created_at desc);

alter table public.security_events enable row level security;

drop policy if exists "security_events_admin_read" on public.security_events;
create policy "security_events_admin_read" on public.security_events
  for select to authenticated
  using (public.is_admin());

drop policy if exists "security_events_admin_insert" on public.security_events;
create policy "security_events_admin_insert" on public.security_events
  for insert to authenticated
  with check (public.is_admin());

create or replace function public.record_security_event(
  p_event_type text,
  p_severity text default 'info',
  p_summary text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  u_email text := '';
  new_id uuid;
begin
  uid := auth.uid();
  if uid is not null then
    select email into u_email from public.profiles where id = uid;
  end if;

  insert into public.security_events (actor_user_id, actor_email, event_type, severity, summary, metadata)
  values (
    uid,
    coalesce(u_email, ''),
    coalesce(nullif(trim(p_event_type), ''), 'security_notice'),
    case when p_severity in ('info', 'warning', 'critical') then p_severity else 'info' end,
    coalesce(nullif(trim(p_summary), ''), p_event_type),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.record_security_event(text, text, text, jsonb) from public, anon;
grant execute on function public.record_security_event(text, text, text, jsonb) to authenticated;
