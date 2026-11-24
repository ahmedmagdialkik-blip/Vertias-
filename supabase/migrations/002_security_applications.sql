-- Veritas MUN: Security Department Applications & Proof Storage Migration
-- Run this script once in the Supabase SQL Editor (Dashboard -> SQL Editor).

-- 1. APPLICATIONS TABLE (creates if missing, or safely upgrades an existing table)
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  track text not null default 'Security',
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  phone text not null default '',
  emergency_contact text not null default '',
  gender text not null default '' check (gender in ('', 'Male', 'Female')),
  school text not null default '',
  grade text not null default '' check (grade in ('', '10', '11', '12', 'First Year University')),
  experience text not null default '',
  proof_urls jsonb not null default '[]'::jsonb,
  why text not null default '',
  role_understanding text not null default '',
  fight_precautions text not null default '',
  rules_enforcement text not null default '',
  attend_all_days boolean not null default true,
  issues_note text not null default 'N/A',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  recommendation text check (recommendation in ('accept', 'reject')),
  recommendation_note text not null default '',
  recommended_by uuid references auth.users(id) on delete set null,
  recommended_at timestamptz,
  decision_note text not null default '',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email, track)
);

alter table public.applications add column if not exists emergency_contact text not null default '';
alter table public.applications add column if not exists gender text not null default '';
alter table public.applications add column if not exists proof_urls jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists role_understanding text not null default '';
alter table public.applications add column if not exists fight_precautions text not null default '';
alter table public.applications add column if not exists rules_enforcement text not null default '';
alter table public.applications add column if not exists attend_all_days boolean not null default true;
alter table public.applications add column if not exists issues_note text not null default 'N/A';
alter table public.applications add column if not exists recommendation text;
alter table public.applications add column if not exists recommendation_note text not null default '';
alter table public.applications add column if not exists recommended_by uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists recommended_at timestamptz;
alter table public.applications add column if not exists decision_note text not null default '';
alter table public.applications add column if not exists decided_by uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists decided_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.applications'::regclass
      and contype = 'u'
  ) then
    alter table public.applications add constraint applications_email_track_key unique (email, track);
  end if;
exception when duplicate_object then null;
end $$;

create index if not exists idx_applications_track_status on public.applications (track, status, created_at desc);

-- 2. BEFORE INSERT TRIGGER (normalizes email & prevents forged pre-approved inserts)
create or replace function public.prepare_application_insert()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.full_name := trim(coalesce(new.full_name, ''));
  new.track := coalesce(nullif(trim(new.track), ''), 'Security');
  new.status := 'pending';
  new.recommendation := null;
  new.recommendation_note := '';
  new.recommended_by := null;
  new.recommended_at := null;
  new.decision_note := '';
  new.decided_by := null;
  new.decided_at := null;
  return new;
end;
$$;

drop trigger if exists trg_prepare_application_insert on public.applications;
create trigger trg_prepare_application_insert
before insert on public.applications
for each row execute function public.prepare_application_insert();

-- 3. ROW LEVEL SECURITY ON APPLICATIONS
alter table public.applications enable row level security;

drop policy if exists "applications_public_insert" on public.applications;
create policy "applications_public_insert" on public.applications
  for insert to anon, authenticated
  with check (true);

drop policy if exists "applications_eb_or_head_select" on public.applications;
create policy "applications_eb_or_head_select" on public.applications
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and lower(trim(coalesce(public.current_department(), ''))) = lower(trim(track))
    )
  );

drop policy if exists "applications_admin_update" on public.applications;
create policy "applications_admin_update" on public.applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "applications_admin_delete" on public.applications;
create policy "applications_admin_delete" on public.applications
  for delete to authenticated
  using (public.is_admin());

-- 4. EB & HEAD REVIEW RPCS
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
  target_track text;
begin
  if auth.uid() is null or not public.is_head_or_admin() then
    raise exception 'Only department heads or EB admins can recommend applications.';
  end if;

  if rec not in ('accept', 'reject') then
    raise exception 'Invalid recommendation.';
  end if;

  select track into target_track from public.applications where id = app_id;
  if target_track is null then
    raise exception 'Application not found.';
  end if;

  if not public.is_admin()
     and lower(trim(coalesce(public.current_department(), ''))) <> lower(trim(target_track)) then
    raise exception 'Heads may only review applications for their own department.';
  end if;

  update public.applications
  set
    recommendation = rec,
    recommendation_note = coalesce(trim(note), ''),
    recommended_by = auth.uid(),
    recommended_at = now()
  where id = app_id;
end;
$$;

create or replace function public.decide_application(
  app_id uuid,
  decision text,
  note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only EB administrators can make final application decisions.';
  end if;

  if decision not in ('accepted', 'rejected', 'pending') then
    raise exception 'Invalid decision.';
  end if;

  update public.applications
  set
    status = decision,
    decision_note = coalesce(trim(note), ''),
    decided_by = case when decision = 'pending' then null else auth.uid() end,
    decided_at = case when decision = 'pending' then null else now() end
  where id = app_id;
end;
$$;

grant execute on function public.recommend_application(uuid, text, text) to authenticated;
grant execute on function public.decide_application(uuid, text, text) to authenticated;

-- 5. PRIVATE STORAGE BUCKET FOR PROOF OF EXPERIENCES (max 100 MB per file, EB/Head read only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-proofs',
  'application-proofs',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "application_proofs_public_insert" on storage.objects;
create policy "application_proofs_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'application-proofs'
    and name like 'security-proofs/%'
    and position('..' in name) = 0
  );

drop policy if exists "application_proofs_eb_read" on storage.objects;
create policy "application_proofs_eb_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'application-proofs'
    and public.is_head_or_admin()
  );

drop policy if exists "application_proofs_admin_delete" on storage.objects;
create policy "application_proofs_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'application-proofs'
    and public.is_admin()
  );
