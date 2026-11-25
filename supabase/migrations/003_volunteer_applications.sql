-- Veritas MUN: Open Volunteer Department Application Schema, RLS & Storage Migration
-- Run this script once in the Supabase SQL Editor (Dashboard -> SQL Editor).

-- 1. ADD VOLUNTEER SCENARIO COLUMN SAFELY (preserves all existing applications & columns)
alter table public.applications
  add column if not exists wandering_action text not null default '';

-- 2. DEPARTMENT-TO-TRACK MATCHING HELPER FOR HEADS (matches 'Volunteer', 'Volunteers', 'Volunteer Department', etc.)
create or replace function public.department_matches_track(dept text, target_track text)
returns boolean
language sql
immutable
as $$
  select
    lower(trim(coalesce(dept, ''))) = lower(trim(coalesce(target_track, '')))
    or (
      lower(trim(coalesce(target_track, ''))) = 'volunteers'
      and lower(trim(coalesce(dept, ''))) like '%volunteer%'
    )
    or (
      lower(trim(coalesce(target_track, ''))) = 'security'
      and lower(trim(coalesce(dept, ''))) like '%security%'
    );
$$;

-- 3. UPDATE SELECT RLS POLICY & RECOMMEND RPC TO MATCH VOLUNTEER HEADS CLEANLY
drop policy if exists "applications_eb_or_head_select" on public.applications;
create policy "applications_eb_or_head_select" on public.applications
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and public.department_matches_track(public.current_department(), track)
    )
  );

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
     and not public.department_matches_track(public.current_department(), target_track) then
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

grant execute on function public.recommend_application(uuid, text, text) to authenticated;

-- 4. UPDATE STORAGE BUCKET LIMIT (1 GB = 1073741824 BYTES) & POLICIES FOR VOLUNTEER PROOFS
-- Note: Supabase Free plans cap global file uploads at 50 MB; raise Storage global upload limit to >= 1 GB in Storage Settings on Pro+ plans.
update storage.buckets
set file_size_limit = 1073741824
where id = 'application-proofs';

drop policy if exists "application_proofs_public_insert" on storage.objects;
create policy "application_proofs_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'application-proofs'
    and (
      name like 'security-proofs/%'
      or name like 'volunteer-proofs/%'
    )
    and position('..' in name) = 0
  );

drop policy if exists "application_proofs_eb_read" on storage.objects;
create policy "application_proofs_eb_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'application-proofs'
    and (
      public.is_admin()
      or (
        public.is_head_or_admin()
        and (
          (name like 'security-proofs/%' and public.department_matches_track(public.current_department(), 'Security'))
          or (name like 'volunteer-proofs/%' and public.department_matches_track(public.current_department(), 'Volunteers'))
        )
      )
    )
  );
