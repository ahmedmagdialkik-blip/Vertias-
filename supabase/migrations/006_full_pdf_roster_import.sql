-- Veritas MUN: Full Executive Board & Department Roster Import + Role/Status Enhancements
-- Run this script once in the Supabase SQL Editor (Dashboard -> SQL Editor).
--
-- Safety guarantees:
--   * Preserves all existing auth.users accounts, passwords, and login sessions.
--   * Explicitly preserves Ahmed Magdi's (ahmedmagdilkik@gmail.com) existing admin permissions and Support Access enrollment.
--   * Allows incomplete roster entries (missing email) without inventing or guessing fake emails.
--   * Allows administrators to deactivate/reactivate roster entries and enforces active-only signup.

-- 1. SCHEMA UPGRADES ON public.roster & public.profiles

alter table public.roster
  alter column email drop not null;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.roster'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%email%'
  loop
    execute format('alter table public.roster drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.roster
  add constraint roster_email_check
  check (email is null or (email = lower(trim(email)) and position('@' in email) > 1));

alter table public.roster
  add column if not exists active boolean not null default true;

alter table public.roster
  add column if not exists account_role text not null default 'member';

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.roster'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%account_role%'
  loop
    execute format('alter table public.roster drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.roster
  add constraint roster_account_role_check
  check (account_role in ('member', 'head', 'advisor', 'admin'));

-- Deduplicate prevention for incomplete entries without email
create unique index if not exists idx_roster_incomplete_name_dept
  on public.roster (lower(trim(full_name)), lower(trim(department)))
  where email is null;

-- Allow 'advisor' role on profiles alongside 'member', 'head', and 'admin'
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('member', 'head', 'advisor', 'admin'));

-- 2. NORMALIZATION & ROLE RESOLUTION FUNCTIONS

create or replace function public.normalize_roster_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is null or length(trim(new.email)) = 0 then
    new.email := null;
  else
    new.email := lower(trim(new.email));
  end if;
  return new;
end;
$$;

create or replace function public.resolve_roster_account_role(
  dept text,
  pos text,
  explicit_role text default null
)
returns text
language plpgsql
immutable
as $$
declare
  clean_explicit text := lower(trim(coalesce(explicit_role, '')));
  clean_dept text := lower(trim(coalesce(dept, '')));
  clean_pos text := lower(trim(coalesce(pos, '')));
begin
  if clean_explicit in ('admin', 'head', 'advisor', 'member') then
    return clean_explicit;
  end if;

  if clean_dept in ('secretaries', 'secretariat') then
    return 'admin';
  end if;

  if clean_dept in ('it', 'information technology') then
    if position('head' in clean_pos) > 0 or position('admin' in clean_pos) > 0 then
      return 'admin';
    end if;
    return 'member';
  end if;

  if position('senior advisor' in clean_dept) > 0
     or clean_dept = 'advisors'
     or position('advisor' in clean_pos) > 0 then
    return 'advisor';
  end if;

  if position('head' in clean_pos) > 0
     or clean_pos in ('sg', 'dsg', 'usg') then
    return 'head';
  end if;

  return 'member';
end;
$$;

-- 3. SIGN-UP GATEKEEPING, ELIGIBILITY CHECK RPC & PROFILE PROVISIONING

create or replace function public.enforce_roster_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  matched_roster public.roster%rowtype;
begin
  if new.email is null or length(trim(new.email)) = 0 then
    raise exception 'This email isn''t on the team list. Contact an admin.' using errcode = 'P0001';
  end if;

  normalized_email := lower(trim(new.email));

  select *
  into matched_roster
  from public.roster
  where email is not null
    and lower(email) = normalized_email
  limit 1;

  if not found then
    raise exception 'This email isn''t on the team list. Contact an admin.' using errcode = 'P0001';
  end if;

  if matched_roster.active is not true then
    raise exception 'Your roster entry is currently inactive. Contact an admin.' using errcode = 'P0001';
  end if;

  new.email := normalized_email;
  return new;
end;
$$;

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
  where email is not null
    and lower(email) = lower(trim(new.email))
    and active = true
  limit 1;

  if not found then
    raise exception 'This email isn''t on the team list. Contact an admin.' using errcode = 'P0001';
  end if;

  assigned_role := public.resolve_roster_account_role(
    matched_roster.department,
    matched_roster.position,
    matched_roster.account_role
  );

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

-- Minimal non-PII RPC so /signup can verify whether an entered email is on the active roster before password creation
create or replace function public.check_roster_signup_eligibility(check_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  norm_email text := lower(trim(coalesce(check_email, '')));
  matched_active boolean;
begin
  if norm_email = '' or position('@' in norm_email) <= 1 then
    return jsonb_build_object('eligible', false, 'reason', 'invalid_email');
  end if;

  select r.active
  into matched_active
  from public.roster r
  where r.email is not null
    and lower(r.email) = norm_email
  limit 1;

  if not found then
    return jsonb_build_object('eligible', false, 'reason', 'not_found');
  end if;

  if matched_active is not true then
    return jsonb_build_object('eligible', false, 'reason', 'inactive');
  end if;

  return jsonb_build_object('eligible', true, 'reason', 'ok');
end;
$$;

revoke all on function public.check_roster_signup_eligibility(text) from public;
grant execute on function public.check_roster_signup_eligibility(text) to anon, authenticated;

-- 4. IDEMPOTENT IMPORT OF ALL 33 VALID-EMAIL PEOPLE FROM OFFICIAL PDF ROSTER
--    (Never touches auth.users passwords or downgrades Ahmed Magdi's existing permissions)

insert into public.roster (full_name, email, phone, department, position, account_role, active, notes)
values
  -- Page 1: SECRETARIES
  ('Laila Mohammad', 'sarasamisara091@gmail.com', '966 57 764 9746', 'Secretaries', 'SG', 'admin', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Laya', 'lshawan@icloud.com', '966 53 309 9462', 'Secretaries', 'DSG', 'admin', true, 'Imported from official EB roster PDF (Page 1)'),

  -- Page 1: LOGISTICS
  ('Ahmad El Amir', 'elamir868@gmail.com', '966 57 167 2294', 'Logistics', 'Member', 'member', true, 'Imported from official EB roster PDF (Page 1)'),

  -- Page 1: MEDIA/PRESS
  ('Dana Al Najjar', 'danaissuperr@gmail.com', '966 55 247 7915', 'Media/Press', 'Female Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Najla Rami', 'spamzjuju1@gmail.com', '966 50 742 8574', 'Media/Press', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Yassin El nahas', 'squadepubg@gmail.com', '966 56 340 4988', 'Media/Press', 'Male Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),

  -- Page 1: SECURITY
  ('karma mohammed', 'karmamohamed71@gmail.com', '966 54 973 5818', 'Security', 'Female Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Amal Houalla', 'amoulehoualla@gmail.com', '966 56 027 8271', 'Security', 'Co Female Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Ali Al Ani', 'al00sh71010@gmail.com', '966 53 660 0227', 'Security', 'Male Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),

  -- Page 1: SENIOR ADVISORS
  ('Malak awad', 'm2011r2013@gmail.com', '966 54 992 6103', 'Senior Advisors', 'Senior Advisor', 'advisor', true, 'Imported from official EB roster PDF (Page 1)'),

  -- Page 1: VOLUNTEERS
  ('Khalid Ibrahim Almahini', 'khalidfly2010@gmail.com', '966 55 461 1223', 'Volunteers', 'Male Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Juana Hamdan', 'juanahamdan130@gmail.com', '966 50 877 3483', 'Volunteers', 'Female Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Thalia barakat', 't3624641@gmail.com', '966 54 784 6997', 'Volunteers', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),

  -- Page 1 & Page 2: HUMAN RESOURCES
  ('Rodina Mostafa', 'rodinasabrie@gmail.com', '966 57 030 2576', 'Human Resources', 'Head', 'head', true, 'Imported from official EB roster PDF (Page 1)'),
  ('Adam Abu ghalwa', 'adghalwa@gmail.com', '966 53 950 4476', 'Human Resources', 'Head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Talia Almuhtadi', 'tjmuhtadi@gmail.com', '966 59 013 8731', 'Human Resources', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),

  -- Page 2: DESIGN
  ('Layan Ahmed', 'layanelsayed8211@gmail.com', '966 53 967 0620', 'Design', 'Head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Saud Alanzi', 'saudps11@gmail.com', '966 59 123 4282', 'Design', 'Head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Helen manal sadi', 'helenmanalsadi@gmail.com', '+966 55 219 0666', 'Design', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Adel Naimi', 'adel.naimi2010@gmail.com', '+966 56 546 7990', 'Design', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),

  -- Page 2: IT
  ('Mohammed Magdi', 'diavlo3444@gmail.com', '966 55 879 2450', 'IT', 'Head', 'admin', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Ahmed Magdi', 'ahmedmagdilkik@gmail.com', '966 55 879 2598', 'IT', 'Co-head', 'admin', true, 'Existing IT Co-Head administrator preserved'),
  ('Saleh samaha', 'sam7awee2010@gmail.com', '966 57 270 6287', 'IT', 'Head', 'admin', true, 'Imported from official EB roster PDF (Page 2)'),

  -- Page 2: MARKETING
  ('Naya Barakat', 'naya44361@gmail.com', '966 54 785 9918', 'Marketing', 'Head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Mohammed el Nahas', 'mamrsabry@gmail.com', '+966 54 807 1438', 'Marketing', 'Member', 'member', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Ahmed Tamer El sayed', 'elsayad.ahmed894@gmail.com', '+966 56 514 1120', 'Marketing', 'Member', 'member', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Rital Marwan Dahdal', 'ritaldahdal27@gmail.com', '+966 50 945 8482', 'Marketing', 'Member', 'member', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Mostafa mahmoud abdou', 'brentcatsabdou2009@gmail.com', '+966 50 351 2461', 'Marketing', 'Member', 'member', true, 'Imported from official EB roster PDF (Page 2)'),

  -- Page 2: CEREMONIES
  ('Aiten mohamed', 'aiten6840@gmail.com', '966 54 373 1910', 'Ceremonies', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Ghalyah Alabduldayem', 'ghdayem22@gmail.com', '966 50 222 2999', 'Ceremonies', 'Head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),

  -- Page 2: DCC
  ('Leen Obeidat', 'obeleen304@gmail.com', '966 59 109 0220', 'DCC', 'Head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('Majd Alnajjar', 'majdalnajjar2009@gmail.com', '966 50 342 9131', 'DCC', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 2)'),
  ('rakan samer', 'ok.rakan.albaba@gmail.com', '+966 56 441 2345', 'DCC', 'Co-head', 'head', true, 'Imported from official EB roster PDF (Page 2)')
on conflict (email) do update
set
  full_name = coalesce(nullif(trim(public.roster.full_name), ''), excluded.full_name),
  phone = coalesce(nullif(trim(public.roster.phone), ''), excluded.phone),
  department = coalesce(nullif(trim(public.roster.department), ''), excluded.department),
  position = coalesce(nullif(trim(public.roster.position), ''), excluded.position),
  account_role = case
    when lower(trim(public.roster.email)) = 'ahmedmagdilkik@gmail.com' then 'admin'
    else excluded.account_role
  end;

-- 5. IDEMPOTENT INSERT OF THE 4 INCOMPLETE ENTRIES MISSING EMAILS IN PDF (NO PLACEHOLDER EMAILS)

insert into public.roster (full_name, email, phone, department, position, account_role, active, notes)
select v.full_name, null, v.phone, v.department, v.position, v.account_role, true, v.notes
from (
  values
    ('zain rawasheda', '966 53 374 9188', 'Secretaries', 'USG', 'admin', 'Incomplete entry from PDF (Page 1): missing email address'),
    ('Meshal alqahtani', '966 53 610 9071', 'Senior Advisors', 'Senior Advisor', 'advisor', 'Incomplete entry from PDF (Page 1): missing email address'),
    ('Adam Abu Taleb', '966 54 652 1051', 'Marketing', 'Member', 'member', 'Incomplete entry from PDF (Page 2): missing email address'),
    ('lily rabia', '+966 59 930 6323', 'PR', 'Head', 'head', 'Incomplete entry from PDF (Page 3): missing email address')
) as v(full_name, phone, department, position, account_role, notes)
where not exists (
  select 1
  from public.roster r
  where lower(trim(r.full_name)) = lower(trim(v.full_name))
    and lower(trim(coalesce(r.department, ''))) = lower(trim(v.department))
);

-- 6. SAFELY LINK ANY UNLINKED EXISTING PROFILES TO MATCHING ROSTER ROWS & PROTECT AHMED MAGDI'S ADMIN ROLE

update public.profiles p
set roster_id = r.id
from public.roster r
where p.roster_id is null
  and r.email is not null
  and lower(trim(p.email)) = lower(trim(r.email));

update public.profiles
set role = 'admin', active = true
where lower(trim(email)) = 'ahmedmagdilkik@gmail.com'
  and (role <> 'admin' or active is not true);
