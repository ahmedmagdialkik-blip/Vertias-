-- Veritas MUN: HR Invites, Non-Expiring Personal Onboarding Tokens, EB Links & Email Delivery System
-- Migration 008 (hashed SHA-256 invite tokens, delivery queue, templates & manual Gmail confirmation)

-- 1. SIGNUP INVITES (Accepted applicants + EB/Staff email-locked & reusable invite links)
create table if not exists public.signup_invites (
  id uuid primary key default gen_random_uuid(),
  invite_kind text not null check (invite_kind in ('applicant_personal', 'eb_email', 'eb_reusable')),
  application_id uuid references public.applications(id) on delete set null,
  token_hash text not null unique,
  token_preview text not null default '',
  recipient_email text not null default '',
  recipient_name text not null default '',
  department text not null default '',
  position text not null default 'Member',
  assigned_role text not null default 'member' check (assigned_role in ('member', 'head', 'admin')),
  eb_rank text not null default 'member' check (eb_rank in ('member', 'co_head', 'head', 'executive')),
  section text not null default '',
  max_uses integer not null default 1,
  use_count integer not null default 0,
  claim_id uuid,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  expires_at timestamptz, -- null = non-expiring personal invite per HR onboarding policy
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_signup_invites_app on public.signup_invites (application_id);
create index if not exists idx_signup_invites_email on public.signup_invites (lower(recipient_email));
create index if not exists idx_signup_invites_kind on public.signup_invites (invite_kind, created_at desc);

-- Legacy & additional hashed tokens linked to an invite so resends preserve prior links safely
create table if not exists public.signup_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.signup_invites(id) on delete cascade,
  token_hash text not null unique,
  token_preview text not null default '',
  created_at timestamptz not null default now()
);

alter table public.signup_invites enable row level security;
alter table public.signup_invite_tokens enable row level security;

drop policy if exists "signup_invites_hr_read" on public.signup_invites;
create policy "signup_invites_hr_read" on public.signup_invites
  for select to authenticated
  using (public.is_hr_authorized());

drop policy if exists "signup_invites_hr_write" on public.signup_invites;
create policy "signup_invites_hr_write" on public.signup_invites
  for all to authenticated
  using (public.is_hr_authorized())
  with check (public.is_hr_authorized());

drop policy if exists "signup_invite_tokens_admin_read" on public.signup_invite_tokens;
create policy "signup_invite_tokens_admin_read" on public.signup_invite_tokens
  for select to authenticated
  using (public.is_hr_authorized());

-- 2. EMAIL TEMPLATES
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  subject text not null,
  body_text text not null,
  body_html text not null default '',
  variables jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_email_templates_updated_at on public.email_templates;
create trigger trg_email_templates_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;

drop policy if exists "email_templates_read" on public.email_templates;
create policy "email_templates_read" on public.email_templates
  for select to authenticated
  using (public.is_email_authorized() or public.is_hr_authorized());

drop policy if exists "email_templates_write" on public.email_templates;
create policy "email_templates_write" on public.email_templates
  for all to authenticated
  using (public.is_email_authorized())
  with check (public.is_email_authorized());

insert into public.email_templates (template_key, name, subject, body_text, variables)
values
  (
    'application_accepted',
    'Application Accepted',
    'Veritas MUN — Your {{department}} Application Has Been Accepted',
    E'Dear {{full_name}},\n\nCongratulations! We are pleased to inform you that your application to the {{department}} Department at Veritas MUN has been accepted.\n\nNext step: You will receive your personal portal onboarding link from Human Resources to activate your Veritas MUN account and digital conference QR pass.\n\nWarm regards,\nVeritas MUN Secretariat & Human Resources',
    '["full_name","department","email","note"]'::jsonb
  ),
  (
    'application_rejected',
    'Application Decision Update',
    'Veritas MUN — Update Regarding Your {{department}} Application',
    E'Dear {{full_name}},\n\nThank you for taking the time to apply to the {{department}} Department at Veritas MUN and sharing your experiences with us.\n\nAfter careful review by the Department Head and Executive Board, we regret that we are unable to offer you a placement in this track this cycle.\n\nWe sincerely appreciate your interest in Veritas MUN.\n\nWarm regards,\nVeritas MUN Secretariat',
    '["full_name","department","email","note"]'::jsonb
  ),
  (
    'application_waitlisted',
    'Application Waitlisted',
    'Veritas MUN — Your {{department}} Application Status (Waitlisted)',
    E'Dear {{full_name}},\n\nThank you for applying to the {{department}} Department at Veritas MUN.\n\nYour application has been placed on our priority waitlist following initial review. We will contact you promptly if an additional placement opens.\n\nWarm regards,\nVeritas MUN Secretariat',
    '["full_name","department","email","note"]'::jsonb
  ),
  (
    'applicant_invite',
    'HR Accepted Applicant Portal Invite',
    'Veritas MUN — Activate Your {{department}} Account',
    E'Dear {{full_name}},\n\nWelcome to Veritas MUN ({{department}} — {{position}}).\n\nPlease open your personal account setup link to create your password and access your staff portal and conference QR pass:\n{{invite_url}}\n\nThis personal link is reserved for {{email}}.\n\nWarm regards,\nVeritas MUN Human Resources',
    '["full_name","department","position","email","invite_url"]'::jsonb
  ),
  (
    'eb_invite',
    'Executive Board / Department Head Invite',
    'Veritas MUN — Executive Board Portal Invitation',
    E'Dear {{full_name}},\n\nYou have been invited to join the Veritas MUN Executive Board / Portal as {{position}} ({{department}}).\n\nUse this invitation link to set up your account:\n{{invite_url}}\n\nWarm regards,\nVeritas MUN Secretariat & IT',
    '["full_name","department","position","email","invite_url"]'::jsonb
  )
on conflict (template_key) do nothing;

-- 3. EMAIL DELIVERIES & MANUAL GMAIL CONFIRMATIONS (100% DATABASE PERSISTENT)
create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.applications(id) on delete set null,
  invite_id uuid references public.signup_invites(id) on delete set null,
  template_key text not null default '',
  recipient_email text not null check (position('@' in recipient_email) > 1),
  recipient_name text not null default '',
  subject text not null check (length(trim(subject)) > 0),
  body_text text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider text not null default 'resend' check (provider in ('resend', 'gmail_manual', 'system')),
  provider_message_id text not null default '',
  error_message text not null default '',
  attempts integer not null default 0,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_deliveries_status on public.email_deliveries (status, created_at desc);
create index if not exists idx_email_deliveries_app on public.email_deliveries (application_id);

create table if not exists public.email_manual_confirmations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid references public.email_deliveries(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  recipient_email text not null,
  recipient_name text not null default '',
  subject text not null default '',
  body_text text not null default '',
  confirmed_by uuid not null references auth.users(id) on delete cascade,
  confirmed_by_email text not null default '',
  note text not null default '',
  confirmed_at timestamptz not null default now()
);

create index if not exists idx_email_manual_conf_date on public.email_manual_confirmations (confirmed_at desc);

alter table public.email_deliveries enable row level security;
alter table public.email_manual_confirmations enable row level security;

drop policy if exists "email_deliveries_read" on public.email_deliveries;
create policy "email_deliveries_read" on public.email_deliveries
  for select to authenticated
  using (public.is_email_authorized() or public.is_hr_authorized());

drop policy if exists "email_deliveries_write" on public.email_deliveries;
create policy "email_deliveries_write" on public.email_deliveries
  for all to authenticated
  using (public.is_email_authorized() or public.is_hr_authorized())
  with check (public.is_email_authorized() or public.is_hr_authorized());

drop policy if exists "email_manual_confirmations_read" on public.email_manual_confirmations;
create policy "email_manual_confirmations_read" on public.email_manual_confirmations
  for select to authenticated
  using (public.is_email_authorized() or public.is_hr_authorized());

drop policy if exists "email_manual_confirmations_insert" on public.email_manual_confirmations;
create policy "email_manual_confirmations_insert" on public.email_manual_confirmations
  for insert to authenticated
  with check (public.is_email_authorized() or public.is_hr_authorized());

-- Atomic RPC for Manual Gmail Fallback Confirmation ("Open in Gmail" -> "Mark as Sent")
create or replace function public.mark_email_manually_sent(
  p_delivery_id uuid,
  p_note text default 'Sent manually via Gmail'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  del_rec public.email_deliveries%rowtype;
  actor_email text := '';
  conf_id uuid;
begin
  if auth.uid() is null or not (public.is_email_authorized() or public.is_hr_authorized()) then
    raise exception 'Unauthorized to confirm manual email delivery.';
  end if;

  select * into del_rec from public.email_deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'Email delivery record not found.';
  end if;

  select email into actor_email from public.profiles where id = auth.uid();

  insert into public.email_manual_confirmations (
    delivery_id,
    application_id,
    recipient_email,
    recipient_name,
    subject,
    body_text,
    confirmed_by,
    confirmed_by_email,
    note
  )
  values (
    del_rec.id,
    del_rec.application_id,
    del_rec.recipient_email,
    del_rec.recipient_name,
    del_rec.subject,
    del_rec.body_text,
    auth.uid(),
    coalesce(actor_email, ''),
    coalesce(nullif(trim(p_note), ''), 'Sent manually via Gmail')
  )
  returning id into conf_id;

  update public.email_deliveries
  set
    status = 'sent',
    provider = 'gmail_manual',
    error_message = '',
    sent_by = auth.uid(),
    sent_at = now()
  where id = del_rec.id;

  if del_rec.application_id is not null then
    update public.applications
    set
      email_status = 'sent_manual',
      email_sent_at = now()
    where id = del_rec.application_id;
  end if;

  insert into public.audit_log (user_id, user_email, action, details)
  values (
    auth.uid(),
    coalesce(actor_email, ''),
    'email_marked_manually_sent',
    jsonb_build_object(
      'delivery_id', del_rec.id,
      'confirmation_id', conf_id,
      'recipient_email', del_rec.recipient_email,
      'subject', del_rec.subject
    )
  );

  return jsonb_build_object('ok', true, 'confirmation_id', conf_id, 'delivery_id', del_rec.id);
end;
$$;

revoke all on function public.mark_email_manually_sent(uuid, text) from public, anon;
grant execute on function public.mark_email_manually_sent(uuid, text) to authenticated;
