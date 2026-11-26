-- Veritas MUN: Executive Board (EB) Departments & Members Migration
-- Run this script once in the Supabase SQL Editor (Dashboard -> SQL Editor).
-- Intentionally contains NO email, phone, or photo columns so personal contact details are never exposed publicly.

-- 1. TABLES

create table if not exists public.eb_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.eb_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.eb_departments(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  role text not null check (length(trim(role)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_eb_departments_sort_order
  on public.eb_departments (sort_order asc, created_at asc);

create index if not exists idx_eb_members_dept_sort_order
  on public.eb_members (department_id, sort_order asc, created_at asc);

-- 2. UPDATED_AT TRIGGERS

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_eb_departments on public.eb_departments;
create trigger trg_touch_eb_departments
before update on public.eb_departments
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_eb_members on public.eb_members;
create trigger trg_touch_eb_members
before update on public.eb_members
for each row execute function public.touch_updated_at();

-- 3. ROW LEVEL SECURITY
-- Public read for display on the conference homepage; writes restricted to authorized Secretariat & IT admins (public.is_admin()).

alter table public.eb_departments enable row level security;
alter table public.eb_members enable row level security;

drop policy if exists "eb_departments_public_read" on public.eb_departments;
create policy "eb_departments_public_read" on public.eb_departments
  for select to anon, authenticated
  using (true);

drop policy if exists "eb_departments_admin_insert" on public.eb_departments;
create policy "eb_departments_admin_insert" on public.eb_departments
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "eb_departments_admin_update" on public.eb_departments;
create policy "eb_departments_admin_update" on public.eb_departments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "eb_departments_admin_delete" on public.eb_departments;
create policy "eb_departments_admin_delete" on public.eb_departments
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "eb_members_public_read" on public.eb_members;
create policy "eb_members_public_read" on public.eb_members
  for select to anon, authenticated
  using (true);

drop policy if exists "eb_members_admin_insert" on public.eb_members;
create policy "eb_members_admin_insert" on public.eb_members
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "eb_members_admin_update" on public.eb_members;
create policy "eb_members_admin_update" on public.eb_members
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "eb_members_admin_delete" on public.eb_members;
create policy "eb_members_admin_delete" on public.eb_members
  for delete to authenticated
  using (public.is_admin());

-- 4. IDEMPOTENT INITIAL SEED (13 Departments, 37 EB Members)

insert into public.eb_departments (name, sort_order) values
  ('Secretariat', 0),
  ('Logistics', 1),
  ('Media / Press', 2),
  ('Security', 3),
  ('Senior Advisors', 4),
  ('Volunteers', 5),
  ('Human Resources', 6),
  ('Design', 7),
  ('IT', 8),
  ('Marketing', 9),
  ('Ceremonies', 10),
  ('DCC', 11),
  ('PR', 12)
on conflict (name) do nothing;

do $$
begin
  if not exists (select 1 from public.eb_members limit 1) then
    insert into public.eb_members (department_id, full_name, role, sort_order)
    select d.id, v.full_name, v.role, v.sort_order
    from (
      values
        ('Secretariat', 'Laila Mohammad', 'Secretary General (SG)', 0),
        ('Secretariat', 'Laya', 'Deputy Secretary General (DSG)', 1),
        ('Secretariat', 'Zain Rawa sheda', 'Under-Secretary General (USG)', 2),

        ('Logistics', 'Ahmad El Amir', 'Logistics', 0),

        ('Media / Press', 'Dana Al Najjar', 'Female Head', 0),
        ('Media / Press', 'Najla Rami', 'Co-Head', 1),
        ('Media / Press', 'Yassin El Nahas', 'Male Head', 2),

        ('Security', 'Karma Mohammed', 'Female Head', 0),
        ('Security', 'Amal Houalla', 'Co-Female Head', 1),
        ('Security', 'Ali Al Ani', 'Male Head', 2),

        ('Senior Advisors', 'Meshal Alqahtani', 'Senior Advisor', 0),
        ('Senior Advisors', 'Malak Awad', 'Senior Advisor', 1),

        ('Volunteers', 'Khalid Ibrahim Almahini', 'Male Head', 0),
        ('Volunteers', 'Juana Hamdan', 'Female Head', 1),
        ('Volunteers', 'Thalia Barakat', 'Co-Head', 2),

        ('Human Resources', 'Rodina Mostafa', 'Head', 0),
        ('Human Resources', 'Adam Abu Ghalwa', 'Head', 1),
        ('Human Resources', 'Talia Almuhtadi', 'Co-Head', 2),

        ('Design', 'Layan Ahmed', 'Head', 0),
        ('Design', 'Saud Alanzi', 'Head', 1),
        ('Design', 'Helen Manal Sadi', 'Co-Head', 2),
        ('Design', 'Adel Naimi', 'Co-Head', 3),

        ('IT', 'Mohammed Magdi', 'Head', 0),
        ('IT', 'Ahmed Magdi', 'Co-Head', 1),
        ('IT', 'Saleh Samaha', 'Head', 2),

        ('Marketing', 'Naya Barakat', 'Head', 0),
        ('Marketing', 'Mohammed El Nahas', 'Member', 1),
        ('Marketing', 'Adam Abu Taleb', 'Member', 2),
        ('Marketing', 'Ahmed Tamer El Sayed', 'Member', 3),
        ('Marketing', 'Rital Marwan Dahdal', 'Member', 4),
        ('Marketing', 'Mostafa Mahmoud Abdou', 'Member', 5),

        ('Ceremonies', 'Aiten Mohamed', 'Co-Head', 0),
        ('Ceremonies', 'Ghalyah Alabduldayem', 'Head', 1),

        ('DCC', 'Leen Obeidat', 'Head', 0),
        ('DCC', 'Majd Alnajjar', 'Co-Head', 1),
        ('DCC', 'Rakan Samer', 'Co-Head', 2),

        ('PR', 'Lily Rabia', 'Head', 0)
    ) as v(dept_name, full_name, role, sort_order)
    join public.eb_departments d on d.name = v.dept_name;
  end if;
end $$;
