-- Veritas MUN: Exclusive Auditable Support Access for Verified Co-Head of IT (Ahmed Magdi)
-- Preserves all existing users, passwords, roles, permissions, and Supabase Auth / RLS protections.
-- Never stores, resets, modifies, or exposes any user password.

-- 1. VERIFIED SUPPORT OPERATORS REGISTRY (Client-immutable; writable only via SQL migration/DB admin)
create table if not exists public.support_access_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(trim(email))),
  label text not null default 'Co-Head of IT',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.support_access_operators enable row level security;

drop policy if exists "support_operators_read_own" on public.support_access_operators;
create policy "support_operators_read_own" on public.support_access_operators
  for select to authenticated
  using (user_id = auth.uid());

-- Enroll Ahmed Magdi's existing verified Co-Head of IT admin account if already registered
insert into public.support_access_operators (user_id, email, label, enabled)
select
  p.id,
  lower(trim(coalesce(u.email, p.email))),
  coalesce(nullif(trim(p.position), ''), 'Co-Head of IT'),
  true
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
  and p.active = true
  and u.email_confirmed_at is not null
  and lower(trim(p.full_name)) like 'ahmed magdi%'
  and (
    lower(coalesce(p.department, '')) ~ '(^|[^a-z])it([^a-z]|$)|information technology'
    or lower(coalesce(p.position, '')) ~ '(^|[^a-z])it([^a-z]|$)|information technology'
  )
on conflict (user_id) do nothing;

-- 2. TEMPORARY AUDITABLE SUPPORT ACCESS SESSIONS TABLE
create table if not exists public.support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  operator_email text not null,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  target_email text not null,
  target_full_name text not null,
  target_role text not null,
  target_department text not null default '',
  reason text not null check (length(trim(reason)) >= 5),
  status text not null default 'active' check (status in ('active', 'ended', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text not null default ''
);

create index if not exists idx_support_sessions_operator_status
  on public.support_access_sessions (operator_user_id, status, started_at desc);

create index if not exists idx_support_sessions_started
  on public.support_access_sessions (started_at desc);

alter table public.support_access_sessions enable row level security;

drop policy if exists "support_sessions_select_admin_or_operator" on public.support_access_sessions;
create policy "support_sessions_select_admin_or_operator" on public.support_access_sessions
  for select to authenticated
  using (
    public.is_admin()
    or operator_user_id = auth.uid()
  );

-- 3. INTERNAL VERIFICATION HELPER (Exclusive to verified Co-Head of IT account)
create or replace function public.is_verified_support_operator()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  u_email text;
  u_confirmed timestamptz;
  p_rec public.profiles%rowtype;
  op_count integer;
begin
  uid := auth.uid();
  if uid is null then
    return false;
  end if;

  select u.email, u.email_confirmed_at
  into u_email, u_confirmed
  from auth.users u
  where u.id = uid;

  if u_email is null or u_confirmed is null then
    return false;
  end if;

  select *
  into p_rec
  from public.profiles p
  where p.id = uid;

  if not found or p_rec.active is not true or p_rec.role <> 'admin' then
    return false;
  end if;

  if exists (
    select 1
    from public.support_access_operators op
    where op.user_id = uid
      and op.enabled = true
      and lower(trim(op.email)) = lower(trim(u_email))
  ) then
    return true;
  end if;

  -- First-time bind ONLY if no operator is pinned yet AND caller's roster record matches Ahmed Magdi (Co-Head of IT)
  select count(*) into op_count from public.support_access_operators;
  if op_count = 0 and p_rec.roster_id is not null then
    return exists (
      select 1
      from public.roster r
      where r.id = p_rec.roster_id
        and lower(trim(r.email)) = lower(trim(u_email))
        and lower(trim(r.full_name)) like 'ahmed magdi%'
        and lower(trim(p_rec.full_name)) like 'ahmed magdi%'
        and lower(coalesce(r.position, '')) like '%head%'
        and (
          lower(coalesce(r.department, '')) ~ '(^|[^a-z])it([^a-z]|$)|information technology'
          or lower(coalesce(r.position, '')) ~ '(^|[^a-z])it([^a-z]|$)|information technology'
        )
    );
  end if;

  return false;
end;
$$;

-- Helper to expire stale active support sessions and record audit events
create or replace function public.expire_stale_support_sessions_for_operator(op_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stale record;
begin
  for stale in
    update public.support_access_sessions
    set
      status = 'expired',
      ended_at = coalesce(ended_at, now()),
      end_reason = case when coalesce(end_reason, '') = '' then 'ttl_expired' else end_reason end
    where operator_user_id = op_uid
      and status = 'active'
      and expires_at <= now()
    returning *
  loop
    insert into public.audit_log (user_id, user_email, action, details)
    values (
      stale.operator_user_id,
      stale.operator_email,
      'support_access_expired',
      jsonb_build_object(
        'session_id', stale.id,
        'operator_user_id', stale.operator_user_id,
        'operator_email', stale.operator_email,
        'target_user_id', stale.target_user_id,
        'target_email', stale.target_email,
        'target_full_name', stale.target_full_name,
        'target_role', stale.target_role,
        'target_department', stale.target_department,
        'reason', stale.reason,
        'started_at', stale.started_at,
        'expires_at', stale.expires_at,
        'ended_at', stale.ended_at
      )
    );
  end loop;
end;
$$;

-- 4. SUPPORT ACCESS STATUS RPC
create or replace function public.get_support_access_status()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  p_rec public.profiles%rowtype;
  active_rec public.support_access_sessions%rowtype;
begin
  uid := auth.uid();
  if uid is null or not public.is_verified_support_operator() then
    return jsonb_build_object(
      'authorized', false,
      'operator', null,
      'active_session', null
    );
  end if;

  select * into p_rec from public.profiles where id = uid;

  -- Permanently bind on first verified access if operators table was empty at migration time
  if not exists (select 1 from public.support_access_operators where user_id = uid) then
    insert into public.support_access_operators (user_id, email, label, enabled)
    values (uid, lower(trim(p_rec.email)), coalesce(nullif(trim(p_rec.position), ''), 'Co-Head of IT'), true)
    on conflict (user_id) do nothing;
  end if;

  perform public.expire_stale_support_sessions_for_operator(uid);

  select *
  into active_rec
  from public.support_access_sessions
  where operator_user_id = uid
    and status = 'active'
    and expires_at > now()
  order by started_at desc
  limit 1;

  return jsonb_build_object(
    'authorized', true,
    'operator', jsonb_build_object(
      'id', p_rec.id,
      'email', p_rec.email,
      'full_name', p_rec.full_name,
      'position', p_rec.position,
      'department', p_rec.department
    ),
    'active_session', case
      when active_rec.id is null then null
      else to_jsonb(active_rec)
    end
  );
end;
$$;

-- 5. START TEMPORARY SUPPORT ACCESS SESSION RPC (Audited)
create or replace function public.start_support_access(
  target_uid uuid,
  access_reason text,
  duration_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  op_rec public.profiles%rowtype;
  tgt_rec public.profiles%rowtype;
  prev_rec record;
  clean_reason text;
  clamped_mins integer;
  created_rec public.support_access_sessions%rowtype;
begin
  uid := auth.uid();
  if uid is null or not public.is_verified_support_operator() then
    raise exception 'Support access is restricted to Ahmed Magdi''s verified Co-Head of IT account.';
  end if;

  if target_uid is null or target_uid = uid then
    raise exception 'Select a different registered user account.';
  end if;

  clean_reason := trim(coalesce(access_reason, ''));
  if length(clean_reason) < 5 then
    raise exception 'Enter a support access reason of at least 5 characters.';
  end if;

  clamped_mins := least(30, greatest(5, coalesce(duration_minutes, 30)));

  select * into op_rec from public.profiles where id = uid;
  select * into tgt_rec from public.profiles where id = target_uid;

  if not found then
    raise exception 'Target registered user account not found.';
  end if;

  -- Permanently bind on first verified start if operators table was empty at migration time
  if not exists (select 1 from public.support_access_operators where user_id = uid) then
    insert into public.support_access_operators (user_id, email, label, enabled)
    values (uid, lower(trim(op_rec.email)), coalesce(nullif(trim(op_rec.position), ''), 'Co-Head of IT'), true)
    on conflict (user_id) do nothing;
  end if;

  perform public.expire_stale_support_sessions_for_operator(uid);

  for prev_rec in
    update public.support_access_sessions
    set
      status = 'ended',
      ended_at = now(),
      end_reason = 'superseded'
    where operator_user_id = uid
      and status = 'active'
    returning *
  loop
    insert into public.audit_log (user_id, user_email, action, details)
    values (
      uid,
      op_rec.email,
      'support_access_ended',
      jsonb_build_object(
        'session_id', prev_rec.id,
        'operator_user_id', uid,
        'operator_email', op_rec.email,
        'target_user_id', prev_rec.target_user_id,
        'target_email', prev_rec.target_email,
        'target_full_name', prev_rec.target_full_name,
        'target_role', prev_rec.target_role,
        'target_department', prev_rec.target_department,
        'reason', prev_rec.reason,
        'end_reason', 'superseded',
        'started_at', prev_rec.started_at,
        'ended_at', prev_rec.ended_at
      )
    );
  end loop;

  insert into public.support_access_sessions (
    operator_user_id,
    operator_email,
    target_user_id,
    target_email,
    target_full_name,
    target_role,
    target_department,
    reason,
    status,
    started_at,
    expires_at
  )
  values (
    uid,
    lower(trim(op_rec.email)),
    tgt_rec.id,
    lower(trim(tgt_rec.email)),
    tgt_rec.full_name,
    tgt_rec.role,
    coalesce(tgt_rec.department, ''),
    clean_reason,
    'active',
    now(),
    now() + make_interval(mins => clamped_mins)
  )
  returning * into created_rec;

  insert into public.audit_log (user_id, user_email, action, details)
  values (
    uid,
    op_rec.email,
    'support_access_started',
    jsonb_build_object(
      'session_id', created_rec.id,
      'operator_user_id', uid,
      'operator_email', created_rec.operator_email,
      'target_user_id', created_rec.target_user_id,
      'target_email', created_rec.target_email,
      'target_full_name', created_rec.target_full_name,
      'target_role', created_rec.target_role,
      'target_department', created_rec.target_department,
      'reason', created_rec.reason,
      'duration_minutes', clamped_mins,
      'started_at', created_rec.started_at,
      'expires_at', created_rec.expires_at
    )
  );

  return to_jsonb(created_rec);
end;
$$;

-- 6. END SUPPORT ACCESS SESSION RPC (Audited, returns Ahmed to his original admin session)
create or replace function public.end_support_access(
  p_session_id uuid default null,
  p_end_reason text default 'manual_exit'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  ended_rec record;
  ended_count integer := 0;
  clean_end_reason text;
begin
  uid := auth.uid();
  if uid is null or not public.is_verified_support_operator() then
    raise exception 'Support access is restricted to Ahmed Magdi''s verified Co-Head of IT account.';
  end if;

  clean_end_reason := coalesce(nullif(trim(p_end_reason), ''), 'manual_exit');

  for ended_rec in
    update public.support_access_sessions
    set
      status = 'ended',
      ended_at = now(),
      end_reason = clean_end_reason
    where operator_user_id = uid
      and status = 'active'
      and (p_session_id is null or id = p_session_id)
    returning *
  loop
    ended_count := ended_count + 1;
    insert into public.audit_log (user_id, user_email, action, details)
    values (
      uid,
      ended_rec.operator_email,
      'support_access_ended',
      jsonb_build_object(
        'session_id', ended_rec.id,
        'operator_user_id', uid,
        'operator_email', ended_rec.operator_email,
        'target_user_id', ended_rec.target_user_id,
        'target_email', ended_rec.target_email,
        'target_full_name', ended_rec.target_full_name,
        'target_role', ended_rec.target_role,
        'target_department', ended_rec.target_department,
        'reason', ended_rec.reason,
        'end_reason', clean_end_reason,
        'started_at', ended_rec.started_at,
        'ended_at', ended_rec.ended_at
      )
    );
  end loop;

  return jsonb_build_object('ended_count', ended_count);
end;
$$;

-- 7. TARGET USER SCOPED DASHBOARD DATA RPC (Enforces target user's exact RLS visibility, zero credentials)
create or replace function public.get_support_session_dashboard_data(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  sess public.support_access_sessions%rowtype;
  tgt public.profiles%rowtype;
  ann_rows jsonb := '[]'::jsonb;
  app_rows jsonb := '[]'::jsonb;
begin
  uid := auth.uid();
  if uid is null or not public.is_verified_support_operator() then
    raise exception 'Support access is restricted to Ahmed Magdi''s verified Co-Head of IT account.';
  end if;

  perform public.expire_stale_support_sessions_for_operator(uid);

  select *
  into sess
  from public.support_access_sessions
  where id = p_session_id
    and operator_user_id = uid;

  if not found then
    raise exception 'Support access session not found.';
  end if;

  if sess.status <> 'active' or sess.expires_at <= now() then
    raise exception 'Support access session has ended or expired.';
  end if;

  select * into tgt from public.profiles where id = sess.target_user_id;
  if not found then
    raise exception 'Target user profile no longer exists.';
  end if;

  if tgt.active = true then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
    into ann_rows
    from public.announcements a
    where tgt.role = 'admin'
       or a.audience = 'all'
       or (a.audience = 'heads' and tgt.role in ('head', 'admin'))
       or (
         a.audience = 'department'
         and coalesce(trim(a.target_department), '') <> ''
         and lower(trim(a.target_department)) = lower(trim(coalesce(tgt.department, '')))
       );

    if tgt.role = 'admin' then
      select coalesce(jsonb_agg(to_jsonb(app) order by app.created_at desc), '[]'::jsonb)
      into app_rows
      from public.applications app;
    elsif tgt.role = 'head' then
      select coalesce(jsonb_agg(to_jsonb(app) order by app.created_at desc), '[]'::jsonb)
      into app_rows
      from public.applications app
      where public.department_matches_track(tgt.department, app.track);
    end if;
  end if;

  return jsonb_build_object(
    'session', to_jsonb(sess),
    'target_profile', jsonb_build_object(
      'id', tgt.id,
      'roster_id', tgt.roster_id,
      'email', tgt.email,
      'full_name', tgt.full_name,
      'department', tgt.department,
      'position', tgt.position,
      'role', tgt.role,
      'active', tgt.active,
      'created_at', tgt.created_at
    ),
    'announcements', ann_rows,
    'applications', app_rows
  );
end;
$$;

revoke all on function public.is_verified_support_operator() from public, anon;
revoke all on function public.expire_stale_support_sessions_for_operator(uuid) from public, anon, authenticated;
revoke all on function public.get_support_access_status() from public, anon;
revoke all on function public.start_support_access(uuid, text, integer) from public, anon;
revoke all on function public.end_support_access(uuid, text) from public, anon;
revoke all on function public.get_support_session_dashboard_data(uuid) from public, anon;

grant execute on function public.get_support_access_status() to authenticated;
grant execute on function public.start_support_access(uuid, text, integer) to authenticated;
grant execute on function public.end_support_access(uuid, text) to authenticated;
grant execute on function public.get_support_session_dashboard_data(uuid) to authenticated;

-- Optional explicit email pin (uncomment and replace only if Ahmed Magdi's roster/profile uses a different name spelling):
-- insert into public.support_access_operators (user_id, email, label, enabled)
-- select id, lower(trim(email)), 'Co-Head of IT', true
-- from public.profiles
-- where lower(trim(email)) = lower('ahmed.email@example.com')
-- on conflict (user_id) do update set enabled = true;
