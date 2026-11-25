export type PortalRole = 'member' | 'head' | 'admin';

export type AdminSectionId =
  | 'overview'
  | 'all_applications'
  | 'security_applications'
  | 'volunteer_applications'
  | 'roster'
  | 'accounts'
  | 'announcements'
  | 'committees_management'
  | 'applications_management'
  | 'content'
  | 'settings'
  | 'account';

export type AdminNavGroup = 'Workspace' | 'Applications' | 'Administration' | 'Site & System';

export interface AdminNavItem {
  id: AdminSectionId;
  label: string;
  group: AdminNavGroup;
  breadcrumb: string;
}

export interface PortalProfileLike {
  id: string;
  full_name?: string;
  email?: string;
  department?: string;
  position?: string;
  role: PortalRole | string;
  active: boolean;
}

export interface ApplicationRecordLike {
  id: string;
  track?: string | null;
  full_name?: string | null;
  email?: string | null;
  school?: string | null;
  phone?: string | null;
  emergency_contact?: string | null;
  gender?: string | null;
  grade?: string | null;
  experience?: string | null;
  proof_urls?: unknown;
  why?: string | null;
  role_understanding?: string | null;
  fight_precautions?: string | null;
  rules_enforcement?: string | null;
  attend_all_days?: boolean | null;
  issues_note?: string | null;
  status?: string | null;
  recommendation?: string | null;
  recommendation_note?: string | null;
  recommended_at?: string | null;
  decision_note?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
}

export interface AnnouncementRecordLike {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'department' | 'heads' | string;
  target_department?: string | null;
  created_at: string;
}

export type ApplicationSortKey = 'newest' | 'oldest' | 'name' | 'status';

export interface ApplicationFilterOptions {
  track?: 'all' | 'Security' | 'Volunteers';
  status?: 'all' | 'pending' | 'accepted' | 'rejected';
  availability?: 'all' | 'yes' | 'no';
  query?: string;
  sortBy?: ApplicationSortKey;
}

export interface ApplicationMetrics {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  recommendedAwaitingDecision: number;
  securityCount: number;
  volunteerCount: number;
}

export interface PortalNotificationItem {
  id: string;
  kind: 'recommendation' | 'pending_review' | 'announcement';
  title: string;
  subtitle: string;
  timestamp: string;
  targetSection: AdminSectionId;
  targetApplicationId?: string;
}

const ALL_NAV_ITEMS: readonly AdminNavItem[] = [
  { id: 'overview', label: 'Overview', group: 'Workspace', breadcrumb: 'Overview' },
  { id: 'all_applications', label: 'All Applications', group: 'Applications', breadcrumb: 'All Applications' },
  { id: 'security_applications', label: 'Security Applications', group: 'Applications', breadcrumb: 'Security Applications' },
  { id: 'volunteer_applications', label: 'Volunteer Applications', group: 'Applications', breadcrumb: 'Volunteer Applications' },
  { id: 'roster', label: 'Team / Roster', group: 'Administration', breadcrumb: 'Team / Roster' },
  { id: 'accounts', label: 'Accounts', group: 'Administration', breadcrumb: 'Accounts' },
  { id: 'announcements', label: 'Announcements', group: 'Administration', breadcrumb: 'Announcements' },
  { id: 'committees_management', label: 'Committees Management', group: 'Site & System', breadcrumb: 'Committees Management' },
  { id: 'applications_management', label: 'Applications Management', group: 'Site & System', breadcrumb: 'Applications Management' },
  { id: 'content', label: 'Website Content', group: 'Site & System', breadcrumb: 'Website Content' },
  { id: 'settings', label: 'Settings', group: 'Site & System', breadcrumb: 'Settings' },
  { id: 'account', label: 'My Account', group: 'Workspace', breadcrumb: 'My Account' }
];

export function getAuthorizedNavItems(role: string | undefined, department: string | undefined): AdminNavItem[] {
  if (role === 'admin') {
    return [...ALL_NAV_ITEMS];
  }
  if (role === 'head') {
    const dept = (department || '').trim().toLowerCase();
    const appSection: AdminNavItem =
      dept === 'volunteers'
        ? ALL_NAV_ITEMS.find(i => i.id === 'volunteer_applications')!
        : dept === 'security'
          ? ALL_NAV_ITEMS.find(i => i.id === 'security_applications')!
          : {
              id: 'all_applications',
              label: department ? `${department.trim()} Applications` : 'Department Applications',
              group: 'Applications',
              breadcrumb: department ? `${department.trim()} Applications` : 'Applications'
            };

    const accountItem = ALL_NAV_ITEMS.find(i => i.id === 'account')!;
    return [appSection, accountItem];
  }
  return [];
}

export function getDefaultSectionForRole(role: string | undefined, department: string | undefined): AdminSectionId {
  const items = getAuthorizedNavItems(role, department);
  return items[0]?.id ?? 'account';
}

export function isSectionAuthorized(
  sectionId: AdminSectionId,
  role: string | undefined,
  department: string | undefined
): boolean {
  return getAuthorizedNavItems(role, department).some(item => item.id === sectionId);
}

export function filterAndSortApplications<T extends ApplicationRecordLike>(
  rows: readonly T[],
  options: ApplicationFilterOptions
): T[] {
  const track = options.track ?? 'all';
  const status = options.status ?? 'all';
  const availability = options.availability ?? 'all';
  const query = (options.query ?? '').trim().toLowerCase();
  const sortBy = options.sortBy ?? 'newest';

  const filtered = rows.filter(row => {
    const rowTrack = (row.track || 'Security').trim();
    if (track !== 'all' && rowTrack.toLowerCase() !== track.toLowerCase()) {
      return false;
    }
    const rowStatus = (row.status || 'pending').trim().toLowerCase();
    if (status !== 'all' && rowStatus !== status) {
      return false;
    }
    if (availability === 'yes' && row.attend_all_days === false) {
      return false;
    }
    if (availability === 'no' && row.attend_all_days !== false) {
      return false;
    }
    if (query) {
      const haystack = [
        row.full_name,
        row.email,
        row.school,
        row.phone,
        row.grade,
        row.experience,
        row.track
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sortBy === 'name') {
      return (a.full_name || '').localeCompare(b.full_name || '');
    }
    if (sortBy === 'status') {
      const rank = (s?: string | null) => (s === 'pending' ? 0 : s === 'accepted' ? 1 : 2);
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
    }
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortBy === 'oldest' ? ta - tb : tb - ta;
  });

  return sorted;
}

export function computeApplicationMetrics(rows: readonly ApplicationRecordLike[]): ApplicationMetrics {
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  let recommendedAwaitingDecision = 0;
  let securityCount = 0;
  let volunteerCount = 0;

  for (const row of rows) {
    const st = (row.status || 'pending').toLowerCase();
    if (st === 'accepted') accepted++;
    else if (st === 'rejected') rejected++;
    else {
      pending++;
      if (row.recommendation === 'accept' || row.recommendation === 'reject') {
        recommendedAwaitingDecision++;
      }
    }

    const tr = (row.track || 'Security').trim().toLowerCase();
    if (tr === 'volunteers') volunteerCount++;
    else securityCount++;
  }

  return {
    total: rows.length,
    pending,
    accepted,
    rejected,
    recommendedAwaitingDecision,
    securityCount,
    volunteerCount
  };
}

export function buildPortalNotifications(
  applications: readonly ApplicationRecordLike[],
  announcements: readonly AnnouncementRecordLike[],
  profile: PortalProfileLike
): PortalNotificationItem[] {
  const items: PortalNotificationItem[] = [];
  const isAdmin = profile.role === 'admin';
  const defaultAppSection: AdminSectionId = isAdmin
    ? 'all_applications'
    : getDefaultSectionForRole(profile.role, profile.department);

  for (const app of applications) {
    if (app.status !== 'pending') continue;
    const track = (app.track || 'Security').trim();
    const targetSection: AdminSectionId = isAdmin
      ? track.toLowerCase() === 'volunteers'
        ? 'volunteer_applications'
        : 'security_applications'
      : defaultAppSection;

    if (isAdmin && (app.recommendation === 'accept' || app.recommendation === 'reject')) {
      items.push({
        id: `rec-${app.id}`,
        kind: 'recommendation',
        title: `${app.full_name || 'Applicant'} recommended to ${app.recommendation}`,
        subtitle: `${track} · Awaiting Executive Board decision`,
        timestamp: app.recommended_at || app.created_at || '',
        targetSection,
        targetApplicationId: app.id
      });
    } else if (!app.recommendation) {
      items.push({
        id: `pend-${app.id}`,
        kind: 'pending_review',
        title: `New ${track} application: ${app.full_name || 'Applicant'}`,
        subtitle: app.school ? `${app.school} · Pending review` : 'Pending review',
        timestamp: app.created_at || '',
        targetSection,
        targetApplicationId: app.id
      });
    }
  }

  for (const ann of announcements) {
    items.push({
      id: `ann-${ann.id}`,
      kind: 'announcement',
      title: ann.title,
      subtitle:
        ann.audience === 'all'
          ? 'Announcement · Team-wide'
          : ann.audience === 'heads'
            ? 'Announcement · Heads & EB'
            : `Announcement · ${ann.target_department || 'Department'}`,
      timestamp: ann.created_at,
      targetSection: isAdmin ? 'announcements' : 'account'
    });
  }

  items.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  return items.slice(0, 12);
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
