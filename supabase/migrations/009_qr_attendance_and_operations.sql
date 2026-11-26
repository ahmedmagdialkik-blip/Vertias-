-- Veritas MUN: QR Attendance Engine, Atomic Row-Locked Check-In/Out & Staff Operations
-- Migration 009 (unified QR passes, scan audit, team groups, cycle-safe hierarchy, shifts, tasks, incidents)

-- 1. QR PASSES TABLE (Opaque VMQR-* codes, SHA-256 token_hash, auto-provisioned for active staff & accepted applicants)
create table if not exists public.qr_passes (
  id uuid primary key default gen_random_uuid(),
  holder_type text not null check (holder_type in ('staff', 'applicant')),
  user_id uuid unique references public.profiles(id) on delete cascade,
  application_id uuid unique references public.applications(id) on delete cascade,
  full_name text not null,
  email text not null default '',
  role_label text not null default 'Staff',
  department text not null default '',
  section text not null default '',
  pass_code text not null unique,
  token_hash text not null unique,
  token_value text not null unique,
  active boolean not null default true,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  checked_in_gate text not null default '',
  checked_out_at timestamptz,
  checked_out_by uuid references auth.users(id) on delete set null,
  checked_out_gate text not null default '',
  scan_count integer not null default 0,
  checkout_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qr_passes_dept on public.qr_passes (department, active);
create index if not exists idx_qr_passes_token_hash on public.qr_passes (token_hash);

drop trigger if exists trg_qr_passes_updated_at on public.qr_passes;
create trigger trg_qr_passes_updated_at
before update on public.qr_passes
for each row execute function public.set_updated_at();

create table if not exists public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid references public.qr_passes(id) on delete set null,
  token_hash text not null default '',
  scan_type text not null check (scan_type in ('check_in', 'check_out')),
  gate_name text not null default 'Main Gate',
  outcome text not null check (outcome in ('success', 'duplicate', 'not_checked_in', 'revoked', 'invalid')),
  scanned_by uuid references auth.users(id) on delete set null,
  scanner_email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_qr_scans_created on public.qr_scans (created_at desc);
create index if not exists idx_qr_scans_pass on public.qr_scans (pass_id, created_at desc);

create table if not exists public.qr_correction_logs (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.qr_passes(id) on delete cascade,
  action text not null,
  reason text not null check (length(trim(reason)) >= 3),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.qr_attendance_resets (
  id uuid primary key default gen_random_uuid(),
  reset_by uuid references auth.users(id) on delete set null,
  reset_by_email text not null default '',
  reason text not null default '',
  affected_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.qr_passes enable row level security;
alter table public.qr_scans enable row level security;
alter table public.qr_correction_logs enable row level security;
alter table public.qr_attendance_resets enable row level security;

-- Strict RLS on QR tables: owners see own pass; authorized scanners / admins / dept heads see scoped passes
drop policy if exists "qr_passes_select_scoped" on public.qr_passes;
create policy "qr_passes_select_scoped" on public.qr_passes
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or public.is_qr_scanner_authorized()
    or (
      public.is_head_or_admin()
      and lower(trim(coalesce(department, ''))) = lower(trim(coalesce(public.current_department(), '')))
    )
  );

drop policy if exists "qr_passes_admin_write" on public.qr_passes;
create policy "qr_passes_admin_write" on public.qr_passes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "qr_scans_select_authorized" on public.qr_scans;
create policy "qr_scans_select_authorized" on public.qr_scans
  for select to authenticated
  using (public.is_admin() or public.is_qr_scanner_authorized());

drop policy if exists "qr_correction_logs_admin_select" on public.qr_correction_logs;
create policy "qr_correction_logs_admin_select" on public.qr_correction_logs
  for select to authenticated
  using (public.is_admin());

drop policy if exists "qr_attendance_resets_admin_select" on public.qr_attendance_resets;
create policy "qr_attendance_resets_admin_select" on public.qr_attendance_resets
  for select to authenticated
  using (public.is_admin());

-- Helper to generate opaque VMQR-* code + SHA-256 token_hash
create or replace function public.generate_vmqr_token_pair()
returns table(token_value text, token_hash text, pass_code text)
language plpgsql
as $$
declare
  raw_hex text;
begin
  raw_hex := encode(gen_random_bytes(16), 'hex');
  token_value := 'VMQR-' || upper(raw_hex);
  token_hash := encode(digest(token_value, 'sha256'), 'hex');
  pass_code := 'VM-' || upper(substr(raw_hex, 1, 8));
  return next;
end;
$$;

-- Auto-provision QR pass for active staff profiles
create or replace function public.sync_staff_qr_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok record;
begin
  if new.active = true then
    if exists (select 1 from public.qr_passes where user_id = new.id) then
      update public.qr_passes
      set
        full_name = new.full_name,
        email = new.email,
        role_label = coalesce(nullif(trim(new.position), ''), initcap(new.role)),
        department = coalesce(new.department, ''),
        section = coalesce(new.section, ''),
        active = true
      where user_id = new.id;
    else
      select * into tok from public.generate_vmqr_token_pair();
      insert into public.qr_passes (
        holder_type, user_id, full_name, email, role_label, department, section,
        pass_code, token_hash, token_value, active
      )
      values (
        'staff', new.id, new.full_name, new.email,
        coalesce(nullif(trim(new.position), ''), initcap(new.role)),
        coalesce(new.department, ''), coalesce(new.section, ''),
        tok.pass_code, tok.token_hash, tok.token_value, true
      );
    end if;
  else
    update public.qr_passes set active = false where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_staff_qr_pass on public.profiles;
create trigger trg_sync_staff_qr_pass
after insert or update on public.profiles
for each row execute function public.sync_staff_qr_pass();

-- Auto-provision / deactivate QR pass for accepted applicants (fixes deactivation asymmetry!)
create or replace function public.sync_applicant_qr_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok record;
begin
  if new.status = 'accepted' then
    if exists (select 1 from public.qr_passes where application_id = new.id) then
      update public.qr_passes
      set
        full_name = new.full_name,
        email = new.email,
        role_label = coalesce(nullif(trim(new.track), ''), 'Accepted Staff') || ' Applicant',
        department = coalesce(new.track, ''),
        section = coalesce(new.gender, ''),
        active = true
      where application_id = new.id;
    else
      select * into tok from public.generate_vmqr_token_pair();
      insert into public.qr_passes (
        holder_type, application_id, full_name, email, role_label, department, section,
        pass_code, token_hash, token_value, active
      )
      values (
        'applicant', new.id, new.full_name, new.email,
        coalesce(nullif(trim(new.track), ''), 'Accepted Staff') || ' Applicant',
        coalesce(new.track, ''), coalesce(new.gender, ''),
        tok.pass_code, tok.token_hash, tok.token_value, true
      );
    end if;
  else
    update public.qr_passes set active = false where application_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_applicant_qr_pass on public.applications;
create trigger trg_sync_applicant_qr_pass
after insert or update of status, full_name, track, gender on public.applications
for each row execute function public.sync_applicant_qr_pass();

-- Backfill QR passes for existing active profiles & accepted applications
insert into public.qr_passes (
  holder_type, user_id, full_name, email, role_label, department, section,
  pass_code, token_hash, token_value, active
)
select
  'staff',
  p.id,
  p.full_name,
  p.email,
  coalesce(nullif(trim(p.position), ''), initcap(p.role)),
  coalesce(p.department, ''),
  coalesce(p.section, ''),
  tok.pass_code,
  tok.token_hash,
  tok.token_value,
  p.active
from public.profiles p
cross join lateral public.generate_vmqr_token_pair() tok
where p.active = true
  and not exists (select 1 from public.qr_passes q where q.user_id = p.id);

insert into public.qr_passes (
  holder_type, application_id, full_name, email, role_label, department, section,
  pass_code, token_hash, token_value, active
)
select
  'applicant',
  a.id,
  a.full_name,
  a.email,
  coalesce(nullif(trim(a.track), ''), 'Accepted Staff') || ' Applicant',
  coalesce(a.track, ''),
  coalesce(a.gender, ''),
  tok.pass_code,
  tok.token_hash,
  tok.token_value,
  true
from public.applications a
cross join lateral public.generate_vmqr_token_pair() tok
where a.status = 'accepted'
  and not exists (select 1 from public.qr_passes q where q.application_id = a.id);

-- ATOMIC FOR-UPDATE CHECK-IN RPC
create or replace function public.atomic_qr_checkin(
  p_token text,
  p_gate text default 'Main Gate'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_token text := upper(trim(coalesce(p_token, '')));
  tok_hash text;
  pass_rec public.qr_passes%rowtype;
  scanner_email_val text := '';
  gate_val text := coalesce(nullif(trim(p_gate), ''), 'Main Gate');
begin
  if auth.uid() is null or not public.is_qr_scanner_authorized() then
    raise exception 'QR scanner access is restricted to Administrators and Security operators.';
  end if;

  if clean_token = '' then
    return jsonb_build_object('ok', false, 'outcome', 'invalid', 'message', 'Scan or enter a valid VMQR token.');
  end if;

  select email into scanner_email_val from public.profiles where id = auth.uid();
  tok_hash := encode(digest(clean_token, 'sha256'), 'hex');

  select * into pass_rec
  from public.qr_passes
  where token_hash = tok_hash or upper(pass_code) = clean_token
  for update;

  if not found then
    insert into public.qr_scans (token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
    values (tok_hash, 'check_in', gate_val, 'invalid', auth.uid(), coalesce(scanner_email_val, ''), 'Unknown QR token');
    return jsonb_build_object('ok', false, 'outcome', 'invalid', 'message', 'Unrecognized conference QR pass.');
  end if;

  if not pass_rec.active then
    insert into public.qr_scans (pass_id, token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
    values (pass_rec.id, pass_rec.token_hash, 'check_in', gate_val, 'revoked', auth.uid(), coalesce(scanner_email_val, ''), 'Revoked/inactive pass');
    return jsonb_build_object('ok', false, 'outcome', 'revoked', 'message', 'This QR pass has been deactivated or revoked.', 'pass', to_jsonb(pass_rec));
  end if;

  if pass_rec.checked_in_at is not null then
    insert into public.qr_scans (pass_id, token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
    values (pass_rec.id, pass_rec.token_hash, 'check_in', gate_val, 'duplicate', auth.uid(), coalesce(scanner_email_val, ''), 'Duplicate check-in blocked');
    return jsonb_build_object(
      'ok', false,
      'outcome', 'duplicate',
      'message', format('%s is already checked in (since %s).', pass_rec.full_name, to_char(pass_rec.checked_in_at, 'HH24:MI')),
      'pass', to_jsonb(pass_rec)
    );
  end if;

  update public.qr_passes
  set
    checked_in_at = now(),
    checked_in_by = auth.uid(),
    checked_in_gate = gate_val,
    scan_count = scan_count + 1
  where id = pass_rec.id
  returning * into pass_rec;

  insert into public.qr_scans (pass_id, token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
  values (pass_rec.id, pass_rec.token_hash, 'check_in', gate_val, 'success', auth.uid(), coalesce(scanner_email_val, ''), 'Checked in');

  return jsonb_build_object(
    'ok', true,
    'outcome', 'success',
    'message', format('Checked in %s (%s).', pass_rec.full_name, pass_rec.department),
    'pass', to_jsonb(pass_rec)
  );
end;
$$;

-- ATOMIC FOR-UPDATE CHECK-OUT RPC
create or replace function public.atomic_qr_checkout(
  p_token text,
  p_gate text default 'Main Gate'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_token text := upper(trim(coalesce(p_token, '')));
  tok_hash text;
  pass_rec public.qr_passes%rowtype;
  scanner_email_val text := '';
  gate_val text := coalesce(nullif(trim(p_gate), ''), 'Main Gate');
  is_repeat boolean := false;
begin
  if auth.uid() is null or not public.is_qr_scanner_authorized() then
    raise exception 'QR scanner access is restricted to Administrators and Security operators.';
  end if;

  if clean_token = '' then
    return jsonb_build_object('ok', false, 'outcome', 'invalid', 'message', 'Scan or enter a valid VMQR token.');
  end if;

  select email into scanner_email_val from public.profiles where id = auth.uid();
  tok_hash := encode(digest(clean_token, 'sha256'), 'hex');

  select * into pass_rec
  from public.qr_passes
  where token_hash = tok_hash or upper(pass_code) = clean_token
  for update;

  if not found then
    insert into public.qr_scans (token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
    values (tok_hash, 'check_out', gate_val, 'invalid', auth.uid(), coalesce(scanner_email_val, ''), 'Unknown QR token');
    return jsonb_build_object('ok', false, 'outcome', 'invalid', 'message', 'Unrecognized conference QR pass.');
  end if;

  if not pass_rec.active then
    insert into public.qr_scans (pass_id, token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
    values (pass_rec.id, pass_rec.token_hash, 'check_out', gate_val, 'revoked', auth.uid(), coalesce(scanner_email_val, ''), 'Revoked/inactive pass');
    return jsonb_build_object('ok', false, 'outcome', 'revoked', 'message', 'This QR pass has been deactivated or revoked.', 'pass', to_jsonb(pass_rec));
  end if;

  if pass_rec.checked_in_at is null then
    insert into public.qr_scans (pass_id, token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
    values (pass_rec.id, pass_rec.token_hash, 'check_out', gate_val, 'not_checked_in', auth.uid(), coalesce(scanner_email_val, ''), 'Check-out blocked: not checked in');
    return jsonb_build_object(
      'ok', false,
      'outcome', 'not_checked_in',
      'message', format('%s has not checked in yet.', pass_rec.full_name),
      'pass', to_jsonb(pass_rec)
    );
  end if;

  is_repeat := pass_rec.checked_out_at is not null;

  update public.qr_passes
  set
    checked_out_at = now(),
    checked_out_by = auth.uid(),
    checked_out_gate = gate_val,
    checkout_count = checkout_count + 1
  where id = pass_rec.id
  returning * into pass_rec;

  insert into public.qr_scans (pass_id, token_hash, scan_type, gate_name, outcome, scanned_by, scanner_email, notes)
  values (
    pass_rec.id, pass_rec.token_hash, 'check_out', gate_val,
    case when is_repeat then 'duplicate' else 'success' end,
    auth.uid(), coalesce(scanner_email_val, ''),
    case when is_repeat then format('Repeat check-out #%s', pass_rec.checkout_count) else 'Checked out' end
  );

  return jsonb_build_object(
    'ok', true,
    'outcome', case when is_repeat then 'repeat_checkout' else 'success' end,
    'repeat_warning', is_repeat,
    'message', case
      when is_repeat then format('Checked out %s again (checkout #%s recorded).', pass_rec.full_name, pass_rec.checkout_count)
      else format('Checked out %s.', pass_rec.full_name)
    end,
    'pass', to_jsonb(pass_rec)
  );
end;
$$;

-- ADMIN MANUAL ATTENDANCE CORRECTION & GLOBAL RESET ("RESET" CONFIRMATION)
create or replace function public.manual_correct_qr_pass(
  p_pass_id uuid,
  p_action text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pass_rec public.qr_passes%rowtype;
  before_json jsonb;
  actor_email_val text := '';
  clean_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can manually correct attendance records.';
  end if;
  if length(clean_reason) < 3 then
    raise exception 'Provide a correction reason (at least 3 characters).';
  end if;
  if p_action not in ('force_checkin', 'force_checkout', 'clear_attendance', 'toggle_active') then
    raise exception 'Invalid correction action.';
  end if;

  select * into pass_rec from public.qr_passes where id = p_pass_id for update;
  if not found then
    raise exception 'QR pass not found.';
  end if;

  before_json := to_jsonb(pass_rec);
  select email into actor_email_val from public.profiles where id = auth.uid();

  if p_action = 'force_checkin' then
    update public.qr_passes
    set checked_in_at = now(), checked_in_by = auth.uid(), checked_in_gate = 'Manual Correction', scan_count = scan_count + 1
    where id = p_pass_id returning * into pass_rec;
  elsif p_action = 'force_checkout' then
    update public.qr_passes
    set checked_out_at = now(), checked_out_by = auth.uid(), checked_out_gate = 'Manual Correction', checkout_count = checkout_count + 1
    where id = p_pass_id returning * into pass_rec;
  elsif p_action = 'clear_attendance' then
    update public.qr_passes
    set checked_in_at = null, checked_in_by = null, checked_in_gate = '',
        checked_out_at = null, checked_out_by = null, checked_out_gate = ''
    where id = p_pass_id returning * into pass_rec;
  elsif p_action = 'toggle_active' then
    update public.qr_passes set active = not active where id = p_pass_id returning * into pass_rec;
  end if;

  insert into public.qr_correction_logs (pass_id, action, reason, before_state, after_state, actor_id, actor_email)
  values (p_pass_id, p_action, clean_reason, before_json, to_jsonb(pass_rec), auth.uid(), coalesce(actor_email_val, ''));

  insert into public.audit_log (user_id, user_email, action, details)
  values (
    auth.uid(), coalesce(actor_email_val, ''), 'qr_manual_correction',
    jsonb_build_object('pass_id', p_pass_id, 'full_name', pass_rec.full_name, 'correction', p_action, 'reason', clean_reason)
  );

  return to_jsonb(pass_rec);
end;
$$;

create or replace function public.reset_all_qr_attendance(
  p_confirmation text,
  p_reason text default 'Conference day reset'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_email_val text := '';
  affected integer := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Only administrators can perform a global attendance reset.';
  end if;
  if coalesce(p_confirmation, '') <> 'RESET' then
    raise exception 'Type RESET in all caps to confirm global attendance reset.';
  end if;

  select email into actor_email_val from public.profiles where id = auth.uid();

  update public.qr_passes
  set
    checked_in_at = null,
    checked_in_by = null,
    checked_in_gate = '',
    checked_out_at = null,
    checked_out_by = null,
    checked_out_gate = ''
  where checked_in_at is not null or checked_out_at is not null;

  get diagnostics affected = row_count;

  insert into public.qr_attendance_resets (reset_by, reset_by_email, reason, affected_count)
  values (auth.uid(), coalesce(actor_email_val, ''), coalesce(nullif(trim(p_reason), ''), 'Conference day reset'), affected);

  insert into public.audit_log (user_id, user_email, action, details)
  values (
    auth.uid(), coalesce(actor_email_val, ''), 'qr_attendance_global_reset',
    jsonb_build_object('affected_count', affected, 'reason', p_reason)
  );

  return jsonb_build_object('ok', true, 'affected_count', affected);
end;
$$;

revoke all on function public.generate_vmqr_token_pair() from public, anon, authenticated;
revoke all on function public.atomic_qr_checkin(text, text) from public, anon;
revoke all on function public.atomic_qr_checkout(text, text) from public, anon;
revoke all on function public.manual_correct_qr_pass(uuid, text, text) from public, anon;
revoke all on function public.reset_all_qr_attendance(text, text) from public, anon;

grant execute on function public.atomic_qr_checkin(text, text) to authenticated;
grant execute on function public.atomic_qr_checkout(text, text) to authenticated;
grant execute on function public.manual_correct_qr_pass(uuid, text, text) to authenticated;
grant execute on function public.reset_all_qr_attendance(text, text) to authenticated;

-- 2. UNIFIED STAFF & DEPARTMENT OPERATIONS TABLES (NO DUPLICATE VIEWS)
create table if not exists public.team_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  department text not null default '',
  description text not null default '',
  lead_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.team_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_in_group text not null default 'Member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- Cycle-safe department hierarchy
create table if not exists public.department_positions (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  title text not null check (length(trim(title)) > 0),
  parent_position_id uuid references public.department_positions(id) on delete set null,
  rank_order integer not null default 0,
  holder_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.prevent_position_cycle()
returns trigger
language plpgsql
as $$
declare
  cursor_id uuid;
  hops integer := 0;
begin
  if new.parent_position_id is null then
    return new;
  end if;
  if new.parent_position_id = new.id then
    raise exception 'A position cannot report to itself.';
  end if;
  cursor_id := new.parent_position_id;
  while cursor_id is not null and hops < 50 loop
    if cursor_id = new.id then
      raise exception 'Hierarchy cycle detected: parent chain loops back to this position.';
    end if;
    select parent_position_id into cursor_id from public.department_positions where id = cursor_id;
    hops := hops + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_prevent_position_cycle on public.department_positions;
create trigger trg_prevent_position_cycle
before insert or update of parent_position_id on public.department_positions
for each row execute function public.prevent_position_cycle();

create table if not exists public.department_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  department text not null default '',
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  group_id uuid references public.team_groups(id) on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.department_shifts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  department text not null default '',
  location text not null default '',
  shift_date text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  capacity integer not null default 5,
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.department_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.department_shifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned', 'checked_in', 'completed', 'excused')),
  note text not null default '',
  assigned_at timestamptz not null default now(),
  unique (shift_id, user_id)
);

create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.department_shift_assignments(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.operations_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  department text not null default 'Security',
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  category text not null default 'Conduct',
  location text not null default '',
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  reported_by uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_team_groups_updated_at on public.team_groups;
create trigger trg_team_groups_updated_at before update on public.team_groups for each row execute function public.set_updated_at();

drop trigger if exists trg_department_positions_updated_at on public.department_positions;
create trigger trg_department_positions_updated_at before update on public.department_positions for each row execute function public.set_updated_at();

drop trigger if exists trg_department_tasks_updated_at on public.department_tasks;
create trigger trg_department_tasks_updated_at before update on public.department_tasks for each row execute function public.set_updated_at();

drop trigger if exists trg_department_shifts_updated_at on public.department_shifts;
create trigger trg_department_shifts_updated_at before update on public.department_shifts for each row execute function public.set_updated_at();

drop trigger if exists trg_operations_incidents_updated_at on public.operations_incidents;
create trigger trg_operations_incidents_updated_at before update on public.operations_incidents for each row execute function public.set_updated_at();

alter table public.team_groups enable row level security;
alter table public.team_group_members enable row level security;
alter table public.department_positions enable row level security;
alter table public.department_tasks enable row level security;
alter table public.department_shifts enable row level security;
alter table public.department_shift_assignments enable row level security;
alter table public.shift_swap_requests enable row level security;
alter table public.operations_incidents enable row level security;

-- Helper for department-scoped read/write checks
create or replace function public.same_department(target_dept text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or (
      public.is_active_member()
      and coalesce(trim(target_dept), '') <> ''
      and lower(trim(target_dept)) = lower(trim(coalesce(public.current_department(), '')))
    );
$$;

revoke all on function public.same_department(text) from public, anon;
grant execute on function public.same_department(text) to authenticated;

drop policy if exists "team_groups_select" on public.team_groups;
create policy "team_groups_select" on public.team_groups
  for select to authenticated
  using (public.is_admin() or public.same_department(department));

drop policy if exists "team_groups_write" on public.team_groups;
create policy "team_groups_write" on public.team_groups
  for all to authenticated
  using (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)))
  with check (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)));

drop policy if exists "team_group_members_select" on public.team_group_members;
create policy "team_group_members_select" on public.team_group_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.team_groups g where g.id = team_group_members.group_id and public.same_department(g.department))
  );

drop policy if exists "team_group_members_write" on public.team_group_members;
create policy "team_group_members_write" on public.team_group_members
  for all to authenticated
  using (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and exists (select 1 from public.team_groups g where g.id = team_group_members.group_id and public.same_department(g.department))
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and exists (select 1 from public.team_groups g where g.id = team_group_members.group_id and public.same_department(g.department))
    )
  );

drop policy if exists "dept_positions_select" on public.department_positions;
create policy "dept_positions_select" on public.department_positions
  for select to authenticated
  using (public.is_admin() or public.same_department(department));

drop policy if exists "dept_positions_write" on public.department_positions;
create policy "dept_positions_write" on public.department_positions
  for all to authenticated
  using (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)))
  with check (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)));

drop policy if exists "dept_tasks_select" on public.department_tasks;
create policy "dept_tasks_select" on public.department_tasks
  for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin() or public.same_department(department));

drop policy if exists "dept_tasks_head_write" on public.department_tasks;
create policy "dept_tasks_head_write" on public.department_tasks
  for all to authenticated
  using (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)))
  with check (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)));

drop policy if exists "dept_tasks_assignee_status" on public.department_tasks;
create policy "dept_tasks_assignee_status" on public.department_tasks
  for update to authenticated
  using (assigned_to = auth.uid() and public.is_active_member())
  with check (assigned_to = auth.uid() and public.is_active_member());

drop policy if exists "dept_shifts_select" on public.department_shifts;
create policy "dept_shifts_select" on public.department_shifts
  for select to authenticated
  using (public.is_admin() or public.same_department(department));

drop policy if exists "dept_shifts_write" on public.department_shifts;
create policy "dept_shifts_write" on public.department_shifts
  for all to authenticated
  using (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)))
  with check (public.is_admin() or (public.is_head_or_admin() and public.same_department(department)));

drop policy if exists "shift_assignments_select" on public.department_shift_assignments;
create policy "shift_assignments_select" on public.department_shift_assignments
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.department_shifts s where s.id = department_shift_assignments.shift_id and public.same_department(s.department))
  );

drop policy if exists "shift_assignments_write" on public.department_shift_assignments;
create policy "shift_assignments_write" on public.department_shift_assignments
  for all to authenticated
  using (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and exists (select 1 from public.department_shifts s where s.id = department_shift_assignments.shift_id and public.same_department(s.department))
    )
  )
  with check (
    public.is_admin()
    or (
      public.is_head_or_admin()
      and exists (select 1 from public.department_shifts s where s.id = department_shift_assignments.shift_id and public.same_department(s.department))
    )
  );

drop policy if exists "shift_swaps_select" on public.shift_swap_requests;
create policy "shift_swaps_select" on public.shift_swap_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or target_user_id = auth.uid()
    or public.is_admin()
    or public.is_head_or_admin()
  );

drop policy if exists "shift_swaps_insert" on public.shift_swap_requests;
create policy "shift_swaps_insert" on public.shift_swap_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and public.is_active_member());

drop policy if exists "shift_swaps_update" on public.shift_swap_requests;
create policy "shift_swaps_update" on public.shift_swap_requests
  for update to authenticated
  using (requester_id = auth.uid() or public.is_admin() or public.is_head_or_admin())
  with check (requester_id = auth.uid() or public.is_admin() or public.is_head_or_admin());

drop policy if exists "operations_incidents_select" on public.operations_incidents;
create policy "operations_incidents_select" on public.operations_incidents
  for select to authenticated
  using (
    reported_by = auth.uid()
    or public.is_admin()
    or public.is_qr_scanner_authorized()
    or (public.is_head_or_admin() and public.same_department(department))
  );

drop policy if exists "operations_incidents_insert" on public.operations_incidents;
create policy "operations_incidents_insert" on public.operations_incidents
  for insert to authenticated
  with check (public.is_active_member() and (reported_by is null or reported_by = auth.uid()));

drop policy if exists "operations_incidents_update" on public.operations_incidents;
create policy "operations_incidents_update" on public.operations_incidents
  for update to authenticated
  using (public.is_admin() or public.is_qr_scanner_authorized() or (public.is_head_or_admin() and public.same_department(department)))
  with check (public.is_admin() or public.is_qr_scanner_authorized() or (public.is_head_or_admin() and public.same_department(department)));

-- Enable Supabase Realtime safely where supported
do $$
begin
  alter publication supabase_realtime add table public.qr_passes;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.qr_scans;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.department_tasks;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.operations_incidents;
exception when others then null;
end $$;
