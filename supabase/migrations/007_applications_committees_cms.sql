-- Veritas MUN: Applications Workflow Upgrade (Waitlisted, Confidential Notes, Decision History/Overrides),
-- Expanded Committees, and Database-Backed Conference CMS (Schedule, FAQs, Documents, Sponsors, Gallery)
-- Migration 007 (preserves all existing applications, proofs, committees, and site_content)

-- 1. UPGRADE APPLICATIONS FOR WAITLISTED, DECISION LOCKING & EMAIL TRACKING
do $$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.applications drop constraint if exists %I', cname);
  end loop;
end $$;

alter table public.applications
  add constraint applications_status_check
  check (status in ('pending', 'accepted', 'rejected', 'waitlisted'));

alter table public.applications add column if not exists section text not null default '';
alter table public.applications add column if not exists decision_locked boolean not null default false;
alter table public.applications add column if not exists last_override_reason text not null default '';
alter table public.applications add column if not exists email_sent_at timestamptz;
alter table public.applications add column if not exists email_status text not null default '';

-- 2. CONFIDENTIAL MEDICAL & WELFARE NOTES (STRICTLY ADMIN ONLY — SEPARATED FROM PUBLIC/HEAD APPLICATION ROWS)
create table if not exists public.application_confidential_notes (
  application_id uuid primary key references public.applications(id) on delete cascade,
  medical_notes text not null default '',
  welfare_flags text not null default '',
  internal_notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_conf_notes_updated_at on public.application_confidential_notes;
create trigger trg_app_conf_notes_updated_at
before update on public.application_confidential_notes
for each row execute function public.set_updated_at();

alter table public.application_confidential_notes enable row level security;

drop policy if exists "app_confidential_admin_all" on public.application_confidential_notes;
create policy "app_confidential_admin_all" on public.application_confidential_notes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3. IMMUTABLE APPLICATION DECISION & OVERRIDE HISTORY
create table if not exists public.application_decision_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  action text not null check (action in ('recommended', 'decided', 'reopened', 'overridden')),
  previous_status text,
  new_status text,
  recommendation text,
  note text not null default '',
  is_override boolean not null default false,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_app_decision_history_app
  on public.application_decision_history (application_id, created_at desc);

alter table public.application_decision_history enable row level security;

drop policy if exists "app_decision_history_select" on public.application_decision_history;
create policy "app_decision_history_select" on public.application_decision_history
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and exists (
        select 1 from public.applications a
        where a.id = application_decision_history.application_id
          and public.department_matches_track(public.current_department(), a.track)
      )
    )
  );

-- Upgrade recommend_application & decide_application to record history, support waitlisted, & enforce override justification
create or replace function public.recommend_application(
  app_id uuid,
  rec text,
  note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  app_rec public.applications%rowtype;
  actor_email_val text := '';
begin
  if auth.uid() is null or not public.is_head_or_admin() then
    raise exception 'Only department heads or EB admins can recommend applications.';
  end if;

  if rec not in ('accept', 'reject') then
    raise exception 'Invalid recommendation.';
  end if;

  select * into app_rec from public.applications where id = app_id;
  if not found then
    raise exception 'Application not found.';
  end if;

  if not public.is_admin()
     and not public.department_matches_track(public.current_department(), app_rec.track) then
    raise exception 'Heads may only review applications for their own department.';
  end if;

  if app_rec.status <> 'pending' then
    raise exception 'Recommendations can only be submitted while the application is pending.';
  end if;

  select email into actor_email_val from public.profiles where id = auth.uid();

  update public.applications
  set
    recommendation = rec,
    recommendation_note = coalesce(trim(note), ''),
    recommended_by = auth.uid(),
    recommended_at = now()
  where id = app_id;

  insert into public.application_decision_history (
    application_id, action, previous_status, new_status, recommendation, note, is_override, actor_user_id, actor_email
  )
  values (
    app_id, 'recommended', app_rec.status, app_rec.status, rec, coalesce(trim(note), ''), false, auth.uid(), coalesce(actor_email_val, '')
  );
end;
$$;

drop function if exists public.decide_application(uuid, text, text);
create or replace function public.decide_application(
  app_id uuid,
  decision text,
  note text default '',
  override_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  app_rec public.applications%rowtype;
  actor_email_val text := '';
  clean_note text := coalesce(trim(note), '');
  clean_override text := coalesce(trim(override_reason), '');
  is_locked_override boolean := false;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only EB administrators can make final application decisions.';
  end if;

  if decision not in ('accepted', 'rejected', 'waitlisted', 'pending') then
    raise exception 'Invalid decision. Allowed: accepted, rejected, waitlisted, pending.';
  end if;

  select * into app_rec from public.applications where id = app_id for update;
  if not found then
    raise exception 'Application not found.';
  end if;

  if app_rec.decision_locked = true and decision <> app_rec.status then
    if length(clean_override) < 5 then
      raise exception 'This application decision is locked. Provide an override reason (min 5 characters) to change it.';
    end if;
    is_locked_override := true;
  end if;

  select email into actor_email_val from public.profiles where id = auth.uid();

  update public.applications
  set
    status = decision,
    decision_note = clean_note,
    decided_by = case when decision = 'pending' then null else auth.uid() end,
    decided_at = case when decision = 'pending' then null else now() end,
    decision_locked = case when decision in ('accepted', 'rejected') then true else false end,
    last_override_reason = case when is_locked_override then clean_override else last_override_reason end
  where id = app_id;

  insert into public.application_decision_history (
    application_id,
    action,
    previous_status,
    new_status,
    recommendation,
    note,
    is_override,
    actor_user_id,
    actor_email
  )
  values (
    app_id,
    case
      when is_locked_override then 'overridden'
      when decision = 'pending' then 'reopened'
      else 'decided'
    end,
    app_rec.status,
    decision,
    app_rec.recommendation,
    case when is_locked_override then clean_override else clean_note end,
    is_locked_override,
    auth.uid(),
    coalesce(actor_email_val, '')
  );

  insert into public.audit_log (user_id, user_email, action, details)
  values (
    auth.uid(),
    coalesce(actor_email_val, ''),
    case when is_locked_override then 'application_decision_override' else 'application_decision' end,
    jsonb_build_object(
      'application_id', app_id,
      'applicant_email', app_rec.email,
      'track', app_rec.track,
      'previous_status', app_rec.status,
      'new_status', decision,
      'note', clean_note,
      'override_reason', clean_override
    )
  );
end;
$$;

revoke all on function public.recommend_application(uuid, text, text) from public, anon;
revoke all on function public.decide_application(uuid, text, text, text) from public, anon;
grant execute on function public.recommend_application(uuid, text, text) to authenticated;
grant execute on function public.decide_application(uuid, text, text, text) to authenticated;

-- 4. EXPAND COMMITTEES METADATA (preserves existing committees rows)
alter table public.committees add column if not exists abbreviation text not null default '';
alter table public.committees add column if not exists chamber text not null default 'General Assembly';
alter table public.committees add column if not exists difficulty text not null default 'Intermediate';
alter table public.committees add column if not exists topics jsonb not null default '[]'::jsonb;
alter table public.committees add column if not exists chair_name text not null default '';
alter table public.committees add column if not exists vice_chair_name text not null default '';
alter table public.committees add column if not exists capacity integer not null default 30;

-- 5. DATABASE-BACKED CONFERENCE CMS TABLES (NO LOCALSTORAGE AS DB)
create table if not exists public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  day_number integer not null default 1,
  title text not null check (length(trim(title)) > 0),
  date_label text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.schedule_days(id) on delete cascade,
  start_time text not null default '',
  end_time text not null default '',
  title text not null check (length(trim(title)) > 0),
  location text not null default '',
  category text not null default 'session',
  description text not null default '',
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'General',
  question text not null check (length(trim(question)) > 0),
  answer text not null check (length(trim(answer)) > 0),
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conference_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  category text not null default 'Study Guide',
  description text not null default '',
  file_url text not null default '',
  audience text not null default 'public' check (audience in ('public', 'staff', 'eb')),
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  tier text not null default 'Partner',
  description text not null default '',
  website_url text not null default '',
  logo_url text not null default '',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  caption text not null default '',
  image_url text not null default '',
  category text not null default 'Conference',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_schedule_days_updated_at on public.schedule_days;
create trigger trg_schedule_days_updated_at before update on public.schedule_days for each row execute function public.set_updated_at();

drop trigger if exists trg_schedule_sessions_updated_at on public.schedule_sessions;
create trigger trg_schedule_sessions_updated_at before update on public.schedule_sessions for each row execute function public.set_updated_at();

drop trigger if exists trg_faqs_updated_at on public.faqs;
create trigger trg_faqs_updated_at before update on public.faqs for each row execute function public.set_updated_at();

drop trigger if exists trg_conference_documents_updated_at on public.conference_documents;
create trigger trg_conference_documents_updated_at before update on public.conference_documents for each row execute function public.set_updated_at();

drop trigger if exists trg_sponsors_updated_at on public.sponsors;
create trigger trg_sponsors_updated_at before update on public.sponsors for each row execute function public.set_updated_at();

drop trigger if exists trg_gallery_items_updated_at on public.gallery_items;
create trigger trg_gallery_items_updated_at before update on public.gallery_items for each row execute function public.set_updated_at();

alter table public.schedule_days enable row level security;
alter table public.schedule_sessions enable row level security;
alter table public.faqs enable row level security;
alter table public.conference_documents enable row level security;
alter table public.sponsors enable row level security;
alter table public.gallery_items enable row level security;

drop policy if exists "schedule_days_read" on public.schedule_days;
create policy "schedule_days_read" on public.schedule_days
  for select to anon, authenticated
  using (published = true or public.is_cms_authorized());

drop policy if exists "schedule_days_write" on public.schedule_days;
create policy "schedule_days_write" on public.schedule_days
  for all to authenticated
  using (public.is_cms_authorized()) with check (public.is_cms_authorized());

drop policy if exists "schedule_sessions_read" on public.schedule_sessions;
create policy "schedule_sessions_read" on public.schedule_sessions
  for select to anon, authenticated
  using (
    public.is_cms_authorized()
    or (
      published = true
      and exists (select 1 from public.schedule_days d where d.id = schedule_sessions.day_id and d.published = true)
    )
  );

drop policy if exists "schedule_sessions_write" on public.schedule_sessions;
create policy "schedule_sessions_write" on public.schedule_sessions
  for all to authenticated
  using (public.is_cms_authorized()) with check (public.is_cms_authorized());

drop policy if exists "faqs_read" on public.faqs;
create policy "faqs_read" on public.faqs
  for select to anon, authenticated
  using (published = true or public.is_cms_authorized());

drop policy if exists "faqs_write" on public.faqs;
create policy "faqs_write" on public.faqs
  for all to authenticated
  using (public.is_cms_authorized()) with check (public.is_cms_authorized());

drop policy if exists "conference_documents_read" on public.conference_documents;
create policy "conference_documents_read" on public.conference_documents
  for select to anon, authenticated
  using (
    public.is_cms_authorized()
    or (published = true and audience = 'public')
    or (published = true and audience = 'staff' and public.is_active_member())
    or (published = true and audience = 'eb' and public.is_head_or_admin())
  );

drop policy if exists "conference_documents_write" on public.conference_documents;
create policy "conference_documents_write" on public.conference_documents
  for all to authenticated
  using (public.is_cms_authorized()) with check (public.is_cms_authorized());

drop policy if exists "sponsors_read" on public.sponsors;
create policy "sponsors_read" on public.sponsors
  for select to anon, authenticated
  using (published = true or public.is_cms_authorized());

drop policy if exists "sponsors_write" on public.sponsors;
create policy "sponsors_write" on public.sponsors
  for all to authenticated
  using (public.is_cms_authorized()) with check (public.is_cms_authorized());

drop policy if exists "gallery_items_read" on public.gallery_items;
create policy "gallery_items_read" on public.gallery_items
  for select to anon, authenticated
  using (published = true or public.is_cms_authorized());

drop policy if exists "gallery_items_write" on public.gallery_items;
create policy "gallery_items_write" on public.gallery_items
  for all to authenticated
  using (public.is_cms_authorized()) with check (public.is_cms_authorized());
