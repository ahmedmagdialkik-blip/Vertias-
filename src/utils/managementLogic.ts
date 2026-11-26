// Veritas MUN Complete Management Infrastructure Pure Logic & RBAC Matrix
// Decoupled and unit-tested independently via node:test.

export type PortalTabId =
  | 'overview'
  | 'applications'
  | 'applications_management'
  | 'departments'
  | 'committees_management'
  | 'hr_invites'
  | 'email_center'
  | 'qr_attendance'
  | 'qr_scanner'
  | 'my_pass'
  | 'operations'
  | 'roster'
  | 'accounts'
  | 'support_access'
  | 'conference_cms'
  | 'team_cards'
  | 'announcements'
  | 'audit_log';

export interface ManagementProfileLike {
  id: string;
  email?: string;
  full_name?: string;
  department?: string;
  position?: string;
  role: 'member' | 'head' | 'admin' | string;
  eb_rank?: 'member' | 'co_head' | 'head' | 'executive' | string;
  section?: string;
  permissions?: Record<string, boolean> | null;
  active: boolean;
}

export interface PortalTabDef {
  id: PortalTabId;
  label: string;
  group: 'Operations' | 'Applications & HR' | 'Communications' | 'QR & Floor' | 'Team & Governance' | 'Website CMS';
}

export const ALL_MANAGEMENT_TABS: readonly PortalTabDef[] = [
  { id: 'overview', label: 'Overview', group: 'Operations' },
  { id: 'applications', label: 'Applications', group: 'Applications & HR' },
  { id: 'applications_management', label: 'Applications Management', group: 'Applications & HR' },
  { id: 'hr_invites', label: 'HR & Onboarding', group: 'Applications & HR' },
  { id: 'email_center', label: 'Email Center', group: 'Communications' },
  { id: 'announcements', label: 'Announcements', group: 'Communications' },
  { id: 'qr_attendance', label: 'QR Attendance', group: 'QR & Floor' },
  { id: 'qr_scanner', label: 'Live QR Scanner', group: 'QR & Floor' },
  { id: 'my_pass', label: 'My QR Pass', group: 'QR & Floor' },
  { id: 'operations', label: 'Tasks, Shifts & Ops', group: 'Operations' },
  { id: 'departments', label: 'Departments', group: 'Team & Governance' },
  { id: 'roster', label: 'Roster', group: 'Team & Governance' },
  { id: 'accounts', label: 'Accounts & Roles', group: 'Team & Governance' },
  { id: 'support_access', label: 'Support Access', group: 'Team & Governance' },
  { id: 'audit_log', label: 'Audit & Security', group: 'Team & Governance' },
  { id: 'committees_management', label: 'Committees Management', group: 'Website CMS' },
  { id: 'conference_cms', label: 'Conference CMS', group: 'Website CMS' },
  { id: 'team_cards', label: 'Team cards', group: 'Website CMS' }
];

export function hasGranularPermission(
  profile: ManagementProfileLike | null | undefined,
  permKey: string
): boolean {
  if (!profile || profile.active !== true) return false;
  if (profile.role === 'admin') return true;
  return Boolean(profile.permissions && profile.permissions[permKey] === true);
}

export function isHrAuthorizedProfile(profile: ManagementProfileLike | null | undefined): boolean {
  if (!profile || profile.active !== true) return false;
  if (profile.role === 'admin' || hasGranularPermission(profile, 'hr_invites')) return true;
  return (
    profile.role === 'head' &&
    /(^|[^a-z])hr([^a-z]|$)|human resources/i.test(profile.department || '')
  );
}

export function isEmailAuthorizedProfile(profile: ManagementProfileLike | null | undefined): boolean {
  if (!profile || profile.active !== true) return false;
  return (
    profile.role === 'admin' ||
    hasGranularPermission(profile, 'email_manage') ||
    isHrAuthorizedProfile(profile)
  );
}

export function isQrScannerAuthorizedProfile(profile: ManagementProfileLike | null | undefined): boolean {
  if (!profile || profile.active !== true) return false;
  if (profile.role === 'admin' || hasGranularPermission(profile, 'qr_scanner')) return true;
  return /security/i.test(profile.department || '');
}

export function isCmsAuthorizedProfile(profile: ManagementProfileLike | null | undefined): boolean {
  if (!profile || profile.active !== true) return false;
  return profile.role === 'admin' || hasGranularPermission(profile, 'cms_manage');
}

export function getAuthorizedManagementTabs(
  profile: ManagementProfileLike | null | undefined,
  options: { supportAuthorized?: boolean } = {}
): PortalTabDef[] {
  if (!profile || profile.active !== true) return [];
  const isAdmin = profile.role === 'admin';
  const isHead = profile.role === 'head';
  const isHr = isHrAuthorizedProfile(profile);
  const isEmail = isEmailAuthorizedProfile(profile);
  const isScanner = isQrScannerAuthorizedProfile(profile);
  const isCms = isCmsAuthorizedProfile(profile);
  const hasDeptAppTrack =
    isAdmin ||
    (isHead && /(security|volunteer)/i.test(profile.department || ''));

  return ALL_MANAGEMENT_TABS.filter(tab => {
    switch (tab.id) {
      case 'overview':
      case 'applications_management':
      case 'departments':
      case 'roster':
      case 'accounts':
      case 'audit_log':
      case 'team_cards':
      case 'announcements':
        return isAdmin;
      case 'committees_management':
      case 'conference_cms':
        return isCms;
      case 'support_access':
        return Boolean(isAdmin && options.supportAuthorized);
      case 'applications':
        return hasDeptAppTrack;
      case 'hr_invites':
        return isHr;
      case 'email_center':
        return isEmail;
      case 'qr_attendance':
        return isAdmin || isHead || isScanner;
      case 'qr_scanner':
        return isScanner;
      case 'operations':
        return isAdmin || isHead || profile.role === 'member';
      case 'my_pass':
        return true;
      default:
        return false;
    }
  });
}

// ---------- Invites & Onboarding Helpers ----------

export function extractInviteTokenFromUrl(search: string, hash: string): string {
  const sp = new URLSearchParams((search || '').replace(/^\?/, ''));
  const hp = new URLSearchParams((hash || '').replace(/^#/, ''));
  return (hp.get('token') || sp.get('token') || '').trim();
}

export function inferInviteRoleAndRank(
  assignedRole: string | undefined,
  position: string | undefined
): { role: 'member' | 'head' | 'admin'; ebRank: 'member' | 'co_head' | 'head' | 'executive' } {
  const pos = (position || '').toLowerCase();
  if (assignedRole === 'admin') {
    return {
      role: 'admin',
      ebRank: pos.includes('co-head') ? 'co_head' : pos.includes('head') ? 'head' : 'executive'
    };
  }
  if (assignedRole === 'head' || pos.includes('head')) {
    return {
      role: 'head',
      ebRank: pos.includes('co-head') ? 'co_head' : 'head'
    };
  }
  return { role: 'member', ebRank: 'member' };
}

export function canIssueApplicantInvite(application: {
  status?: string | null;
  email?: string | null;
}): { ok: boolean; reason?: string } {
  if (!application || application.status !== 'accepted') {
    return { ok: false, reason: 'Only accepted applicants can receive an onboarding invite.' };
  }
  const em = (application.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) {
    return { ok: false, reason: 'Applicant record does not have a valid email address.' };
  }
  return { ok: true };
}

// ---------- Email Templating & Manual Gmail Fallback ----------

export function interpolateEmailTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const val = vars[key];
    return typeof val === 'string' ? val : '';
  });
}

export function buildGmailComposeUrl(params: {
  to: string;
  subject: string;
  body: string;
}): string {
  const url = new URL('https://mail.google.com/mail/');
  url.searchParams.set('view', 'cm');
  url.searchParams.set('fs', '1');
  url.searchParams.set('to', (params.to || '').trim());
  url.searchParams.set('su', (params.subject || '').trim());
  url.searchParams.set('body', (params.body || '').trim());
  return url.toString();
}

// ---------- QR Attendance & Scanner Logic ----------

export interface QrPassLike {
  id: string;
  holder_type: 'staff' | 'applicant' | string;
  full_name: string;
  email?: string;
  department?: string;
  role_label?: string;
  section?: string;
  pass_code: string;
  token_value?: string;
  active: boolean;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  scan_count?: number;
  checkout_count?: number;
}

export function normalizeQrTokenInput(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  // Support scanning either a full token URL (?token=VMQR-...) or raw token string
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      const t = parsed.searchParams.get('token') || parsed.searchParams.get('code');
      if (t) return t.trim().toUpperCase();
    }
  } catch {
    // treat as raw token string
  }
  return trimmed.toUpperCase();
}

export function summarizeQrAttendance(passes: readonly QrPassLike[]): {
  totalPasses: number;
  activePasses: number;
  checkedIn: number;
  checkedOut: number;
  currentlyInside: number;
} {
  let activePasses = 0;
  let checkedIn = 0;
  let checkedOut = 0;
  let currentlyInside = 0;

  for (const p of passes) {
    if (p.active) activePasses++;
    if (p.checked_in_at) {
      checkedIn++;
      if (p.checked_out_at) checkedOut++;
      else currentlyInside++;
    }
  }

  return {
    totalPasses: passes.length,
    activePasses,
    checkedIn,
    checkedOut,
    currentlyInside
  };
}

export function filterQrPasses<T extends QrPassLike>(
  passes: readonly T[],
  opts: { query?: string; department?: string; state?: 'all' | 'inside' | 'checked_out' | 'not_checked_in' | 'inactive' }
): T[] {
  const q = (opts.query || '').trim().toLowerCase();
  const dept = (opts.department || 'all').trim().toLowerCase();
  const state = opts.state || 'all';

  return passes.filter(p => {
    if (dept !== 'all' && (p.department || '').trim().toLowerCase() !== dept) return false;
    if (state === 'inactive' && p.active) return false;
    if (state === 'inside' && (!p.active || !p.checked_in_at || Boolean(p.checked_out_at))) return false;
    if (state === 'checked_out' && (!p.checked_in_at || !p.checked_out_at)) return false;
    if (state === 'not_checked_in' && (!p.active || Boolean(p.checked_in_at))) return false;
    if (q) {
      const hay = `${p.full_name} ${p.email || ''} ${p.department || ''} ${p.pass_code} ${p.role_label || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------- Operations: Hierarchy Cycle Detection & Shift Validation ----------

export interface HierarchyNodeLike {
  id: string;
  parent_position_id?: string | null;
}

export function wouldCreateHierarchyCycle(
  nodes: readonly HierarchyNodeLike[],
  nodeId: string,
  candidateParentId: string | null | undefined
): boolean {
  if (!candidateParentId) return false;
  if (nodeId === candidateParentId) return true;

  const byId = new Map<string, string | null>();
  for (const n of nodes) {
    byId.set(n.id, n.parent_position_id || null);
  }

  let cursor: string | null | undefined = candidateParentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === nodeId) return true;
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = byId.get(cursor);
  }
  return false;
}

export function validateApplicationOverrideReason(
  decisionLocked: boolean,
  previousStatus: string,
  nextStatus: string,
  overrideReason: string
): string | null {
  if (!decisionLocked || previousStatus === nextStatus) return null;
  if ((overrideReason || '').trim().length < 5) {
    return 'Decision is locked. Enter an Executive Board override justification (min 5 characters).';
  }
  return null;
}
