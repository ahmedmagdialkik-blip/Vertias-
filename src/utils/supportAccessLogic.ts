export type SupportSessionStatus = 'active' | 'ended' | 'expired';

export interface SupportOperatorInfo {
  id: string;
  email: string;
  full_name: string;
  position: string;
  department: string;
}

export interface SupportTargetProfile {
  id: string;
  roster_id?: string | null;
  email: string;
  full_name: string;
  department: string;
  position: string;
  role: string;
  active: boolean;
  created_at?: string;
}

export interface SupportAccessSession {
  id: string;
  operator_user_id: string;
  operator_email: string;
  target_user_id: string;
  target_email: string;
  target_full_name: string;
  target_role: string;
  target_department: string;
  reason: string;
  status: SupportSessionStatus;
  started_at: string;
  expires_at: string;
  ended_at?: string | null;
  end_reason?: string | null;
}

export interface SupportAccessStatus {
  authorized: boolean;
  operator: SupportOperatorInfo | null;
  active_session: SupportAccessSession | null;
}

export const MIN_SUPPORT_REASON_LENGTH = 5;
export const MIN_SUPPORT_DURATION_MINUTES = 5;
export const MAX_SUPPORT_DURATION_MINUTES = 30;
export const DEFAULT_SUPPORT_DURATION_MINUTES = 15;

const SENSITIVE_FIELD_KEYS = new Set([
  'password',
  'encrypted_password',
  'password_hash',
  'hash',
  'salt',
  'recovery_token',
  'confirmation_token',
  'email_change_token',
  'access_token',
  'refresh_token',
  'session_token'
]);

export function stripSensitiveAccountFields<T extends Record<string, unknown>>(
  record: T
): Omit<
  T,
  | 'password'
  | 'encrypted_password'
  | 'password_hash'
  | 'hash'
  | 'salt'
  | 'recovery_token'
  | 'confirmation_token'
  | 'email_change_token'
  | 'access_token'
  | 'refresh_token'
  | 'session_token'
> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record || {})) {
    if (!SENSITIVE_FIELD_KEYS.has(key.toLowerCase())) {
      clean[key] = val;
    }
  }
  return clean as any;
}

export function isAhmedCoHeadProfile(
  profile: Partial<SupportTargetProfile> | null | undefined,
  emailVerified = true
): boolean {
  if (!profile || !emailVerified) return false;
  if (profile.role !== 'admin' || profile.active !== true) return false;
  const fullName = String(profile.full_name || '').trim().toLowerCase();
  const department = String(profile.department || '').trim().toLowerCase();
  const position = String(profile.position || '').trim().toLowerCase();
  const matchesName = fullName === 'ahmed magdi' || fullName.startsWith('ahmed magdi ');
  const matchesIt =
    /(^|[^a-z])it([^a-z]|$)|information technology/.test(department) ||
    /(^|[^a-z])it([^a-z]|$)|information technology/.test(position);
  const matchesCoHead = position.includes('head');
  return matchesName && matchesIt && matchesCoHead;
}

export function clampSupportDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_SUPPORT_DURATION_MINUTES;
  return Math.min(
    MAX_SUPPORT_DURATION_MINUTES,
    Math.max(MIN_SUPPORT_DURATION_MINUTES, Math.round(minutes))
  );
}

export function validateSupportAccessStart(opts: {
  operatorId?: string | null;
  targetId?: string | null;
  reason: string;
  durationMinutes: number;
}): string | null {
  const targetId = String(opts.targetId || '').trim();
  if (!targetId) {
    return 'Select a registered user account to access.';
  }
  if (opts.operatorId && targetId === opts.operatorId) {
    return 'Select a different registered user account.';
  }
  const cleanReason = String(opts.reason || '').trim();
  if (cleanReason.length < MIN_SUPPORT_REASON_LENGTH) {
    return `Enter a brief support reason (at least ${MIN_SUPPORT_REASON_LENGTH} characters).`;
  }
  if (
    !Number.isFinite(opts.durationMinutes) ||
    opts.durationMinutes < MIN_SUPPORT_DURATION_MINUTES ||
    opts.durationMinutes > MAX_SUPPORT_DURATION_MINUTES
  ) {
    return `Support session duration must be between ${MIN_SUPPORT_DURATION_MINUTES} and ${MAX_SUPPORT_DURATION_MINUTES} minutes.`;
  }
  return null;
}

export function filterRegisteredUsersForSupport(
  profiles: SupportTargetProfile[],
  operatorId: string | undefined,
  query: string,
  roleFilter: 'all' | 'member' | 'head' | 'admin' = 'all'
): SupportTargetProfile[] {
  const q = (query || '').trim().toLowerCase();
  return (profiles || [])
    .filter(p => p && p.id && p.id !== operatorId)
    .map(p => stripSensitiveAccountFields(p as unknown as Record<string, unknown>) as unknown as SupportTargetProfile)
    .filter(p => roleFilter === 'all' || p.role === roleFilter)
    .filter(p => {
      if (!q) return true;
      const haystack = `${p.full_name || ''} ${p.email || ''} ${p.department || ''} ${p.position || ''} ${p.role || ''}`.toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });
}

export function isSupportSessionActive(
  session: SupportAccessSession | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!session || session.status !== 'active') return false;
  const expiresMs = Date.parse(session.expires_at);
  return Number.isFinite(expiresMs) && expiresMs > nowMs;
}

export function formatRemainingTime(expiresAt: string, nowMs: number = Date.now()): string {
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return '00:00';
  const diffSec = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export type TargetDashboardTab = 'account' | 'applications' | 'waiting_approval';

export function getTargetAvailableDashboardTabs(
  targetProfile: SupportTargetProfile | null | undefined
): TargetDashboardTab[] {
  if (!targetProfile || !targetProfile.active) {
    return ['waiting_approval'];
  }
  if (targetProfile.role === 'head' || targetProfile.role === 'admin') {
    return ['applications', 'account'];
  }
  return ['account'];
}

export function formatSupportAuditSummary(
  action: string,
  details: Record<string, unknown> | null | undefined
): string {
  const d = details || {};
  const targetName = String(d.target_full_name || d.target_email || 'user').trim();
  const targetRole = String(d.target_role || '').trim();
  const reason = String(d.reason || '').trim();
  if (action === 'support_access_started') {
    return `Started temporary support access for ${targetName}${targetRole ? ` (${targetRole})` : ''}${reason ? ` — "${reason}"` : ''}`;
  }
  if (action === 'support_access_ended') {
    const endReason = String(d.end_reason || 'manual_exit').trim();
    return `Ended support access for ${targetName} (${endReason})`;
  }
  if (action === 'support_access_expired') {
    return `Support access session for ${targetName} expired automatically`;
  }
  return action;
}
