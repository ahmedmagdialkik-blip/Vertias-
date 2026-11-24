import type {
  AnnouncementRow,
  FullSiteContent,
  ProfileRow,
  RosterRow,
  TbaSectionContent,
  TeamCardRow
} from '../types/database';

export const DEFAULT_SITE_CONTENT: FullSiteContent = {
  hero: {
    title: 'VERITAS MUN',
    tagline: 'Where diplomacy meets truth',
    ctaLabel: 'Apply as Security'
  },
  about: {
    paragraphs: [
      'Veritas MUN is a Model United Nations conference built around careful research and direct debate.',
      'Delegates represent assigned portfolios, draft working papers, and take part in committee sessions.'
    ]
  },
  committees: {
    showTba: true,
    tbaSubtitle: 'To be announced.',
    items: []
  },
  schedule: {
    showTba: true,
    tbaSubtitle: 'To be announced.',
    items: []
  },
  faq: {
    showTba: true,
    tbaSubtitle: 'To be announced.',
    items: []
  },
  register: {
    showTba: true,
    tbaSubtitle: 'To be announced.',
    items: []
  },
  settings: {
    site_name: 'Veritas MUN',
    registration_open: false,
    contact_email: ''
  }
};

export const DEFAULT_TEAM_CARDS: TeamCardRow[] = [
  {
    id: 'default-laila',
    full_name: 'Laila Mohammad',
    title: 'Secretary-General',
    photo_url: '/assets/aistudio/WhatsApp_Image_2026-11-22_at_9.00.13_AM__1__294445e1.jpeg',
    sort_order: 0,
    visible: true
  },
  {
    id: 'default-zain',
    full_name: 'Zain Rawashdeh',
    title: 'Under-Secretary-General',
    photo_url: '/assets/aistudio/WhatsApp_Image_2026-11-03_at_9.48.11_AM__2__b371837c.jpeg',
    sort_order: 1,
    visible: true
  },
  {
    id: 'default-laya',
    full_name: 'Laya Shahwan',
    title: 'Deputy Secretary-General',
    photo_url: '/assets/aistudio/WhatsApp_Image_2026-10-21_at_5.27.20_PM__3__1145c352.jpeg',
    sort_order: 2,
    visible: true
  }
];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized);
}

export function validateSignupInput(email: string, password: string): string | null {
  if (!isValidEmailFormat(email)) {
    return 'Enter a valid email address.';
  }
  if (password.length < 10) {
    return 'Password must be at least 10 characters long.';
  }
  return null;
}

export function extractFirstName(fullName: string): string {
  const cleaned = fullName.trim();
  if (!cleaned) return 'Member';
  return cleaned.split(/\s+/)[0] || 'Member';
}

export function formatMemberWelcome(profile: Pick<ProfileRow, 'full_name' | 'position' | 'department'>): string {
  const firstName = extractFirstName(profile.full_name);
  const pos = profile.position.trim() || 'Member';
  const dept = profile.department.trim();
  return dept ? `Welcome, ${firstName} (${pos}, ${dept})` : `Welcome, ${firstName} (${pos})`;
}

export type AdminAccessDecision = 'redirect_login' | 'access_denied' | 'allow';

export function computeAdminAccess(
  loading: boolean,
  isAuthenticated: boolean,
  profile: Pick<ProfileRow, 'role' | 'active'> | null
): AdminAccessDecision | 'loading' {
  if (loading) return 'loading';
  if (!isAuthenticated) return 'redirect_login';
  if (!profile || !profile.active || profile.role !== 'admin') return 'access_denied';
  return 'allow';
}

export interface RateLimitState {
  timestamps: number[];
}

export const SIGNUP_RATE_LIMIT_MAX = 5;
export const SIGNUP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export function pruneAttemptTimestamps(timestamps: number[], nowMs: number, windowMs = SIGNUP_RATE_LIMIT_WINDOW_MS): number[] {
  return timestamps.filter(ts => nowMs - ts < windowMs);
}

export function checkRateLimit(
  timestamps: number[],
  nowMs: number,
  maxAttempts = SIGNUP_RATE_LIMIT_MAX,
  windowMs = SIGNUP_RATE_LIMIT_WINDOW_MS
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const recent = pruneAttemptTimestamps(timestamps, nowMs, windowMs);
  if (recent.length < maxAttempts) {
    return {
      allowed: true,
      remainingAttempts: maxAttempts - recent.length,
      retryAfterSeconds: 0
    };
  }
  const oldest = Math.min(...recent);
  const retryAfterMs = Math.max(1000, windowMs - (nowMs - oldest));
  return {
    allowed: false,
    remainingAttempts: 0,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
  };
}

export function resolveSignupErrorMessage(rawMessage: string): string {
  const msg = rawMessage || '';
  const lower = msg.toLowerCase();
  if (lower.includes("isn't on the team list") || lower.includes('isnt on the team list') || lower.includes('not on the team list')) {
    return "This email isn't on the team list. Contact an admin.";
  }
  if (lower.includes('already registered') || lower.includes('user already exists')) {
    return 'An account for this email already exists. Try signing in or resetting your password.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many sign-up attempts. Please wait a few minutes and try again.';
  }
  if (lower.includes('password') && lower.includes('10')) {
    return 'Password must be at least 10 characters long.';
  }
  return msg || 'Unable to complete sign-up right now.';
}

export interface ParsedCsvRowInput {
  lineNumber: number;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  notes?: string;
}

export interface CsvImportValidationRow extends ParsedCsvRowInput {
  valid: boolean;
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseAndValidateRosterCsv(
  csvText: string,
  existingRosterEmails: string[]
): { rows: CsvImportValidationRow[]; headerError: string | null } {
  const rawLines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (rawLines.length === 0) {
    return { rows: [], headerError: 'CSV is empty.' };
  }

  const headerCells = splitCsvLine(rawLines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const idxName = headerCells.indexOf('full_name');
  const idxEmail = headerCells.indexOf('email');
  const idxPhone = headerCells.indexOf('phone');
  const idxDept = headerCells.indexOf('department');
  const idxPos = headerCells.indexOf('position');
  const idxNotes = headerCells.indexOf('notes');

  if (idxName === -1 || idxEmail === -1) {
    return {
      rows: [],
      headerError: 'CSV header must include at least: full_name, email (optional: phone, department, position, notes).'
    };
  }

  const existingSet = new Set(existingRosterEmails.map(normalizeEmail));
  const seenCsvEmails = new Set<string>();
  const rows: CsvImportValidationRow[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    const cells = splitCsvLine(rawLines[i]);
    const full_name = (cells[idxName] || '').trim();
    const email = normalizeEmail(cells[idxEmail] || '');
    const phone = idxPhone >= 0 ? (cells[idxPhone] || '').trim() : '';
    const department = idxDept >= 0 ? (cells[idxDept] || '').trim() : '';
    const position = idxPos >= 0 ? (cells[idxPos] || '').trim() || 'Member' : 'Member';
    const notes = idxNotes >= 0 ? (cells[idxNotes] || '').trim() : '';

    const errors: string[] = [];
    if (!full_name) errors.push('Missing full_name');
    if (!email) errors.push('Missing email');
    else if (!isValidEmailFormat(email)) errors.push('Invalid email format');

    if (email && existingSet.has(email)) {
      errors.push('Already in roster');
    }
    if (email && seenCsvEmails.has(email)) {
      errors.push('Duplicate email in CSV');
    }
    if (email) seenCsvEmails.add(email);

    rows.push({
      lineNumber: i + 1,
      full_name,
      email,
      phone,
      department,
      position,
      notes,
      valid: errors.length === 0,
      errors
    });
  }

  return { rows, headerError: null };
}

function escapeCsvCell(value: string): string {
  let clean = value ?? '';
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, cr)
  if (/^[=+\-@\t\r]/.test(clean)) {
    clean = `'${clean}`;
  }
  if (/[",\n\r]/.test(clean)) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

export function exportRosterToCsv(rows: RosterRow[]): string {
  const header = 'full_name,email,phone,department,position,notes';
  const body = rows.map(r =>
    [
      escapeCsvCell(r.full_name),
      escapeCsvCell(r.email),
      escapeCsvCell(r.phone),
      escapeCsvCell(r.department),
      escapeCsvCell(r.position),
      escapeCsvCell(r.notes)
    ].join(',')
  );
  return [header, ...body].join('\n');
}

export function computeOverviewMetrics(roster: RosterRow[], profiles: ProfileRow[]): {
  totalRoster: number;
  signedUpCount: number;
  notSignedUpCount: number;
  activeAccountsCount: number;
} {
  const linkedRosterIds = new Set(
    profiles.map(p => p.roster_id).filter((id): id is string => Boolean(id))
  );
  let signedUpCount = 0;
  for (const r of roster) {
    if (linkedRosterIds.has(r.id)) signedUpCount++;
  }
  return {
    totalRoster: roster.length,
    signedUpCount,
    notSignedUpCount: Math.max(0, roster.length - signedUpCount),
    activeAccountsCount: profiles.filter(p => p.active).length
  };
}

export function mergeSiteContentWithFallback(
  rows: Array<{ key: string; value: unknown }>
): FullSiteContent {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (row && typeof row.key === 'string' && row.value && typeof row.value === 'object') {
      map.set(row.key, row.value as Record<string, unknown>);
    }
  }

  const pickSection = <T,>(key: 'committees' | 'schedule' | 'faq' | 'register'): TbaSectionContent<T> => {
    const raw = map.get(key);
    const fb = DEFAULT_SITE_CONTENT[key] as unknown as TbaSectionContent<T>;
    if (!raw) return fb;
    return {
      showTba: typeof raw.showTba === 'boolean' ? raw.showTba : fb.showTba,
      tbaSubtitle: typeof raw.tbaSubtitle === 'string' && raw.tbaSubtitle.trim() ? raw.tbaSubtitle : fb.tbaSubtitle,
      items: Array.isArray(raw.items) ? (raw.items as T[]) : fb.items
    };
  };

  const heroRaw = map.get('hero');
  const aboutRaw = map.get('about');
  const settingsRaw = map.get('settings');

  return {
    hero: {
      title: typeof heroRaw?.title === 'string' && heroRaw.title.trim() ? heroRaw.title : DEFAULT_SITE_CONTENT.hero.title,
      tagline: typeof heroRaw?.tagline === 'string' && heroRaw.tagline.trim() ? heroRaw.tagline : DEFAULT_SITE_CONTENT.hero.tagline,
      ctaLabel: typeof heroRaw?.ctaLabel === 'string' && heroRaw.ctaLabel.trim() ? heroRaw.ctaLabel : DEFAULT_SITE_CONTENT.hero.ctaLabel
    },
    about: {
      paragraphs:
        Array.isArray(aboutRaw?.paragraphs) && aboutRaw.paragraphs.some(p => typeof p === 'string' && p.trim().length > 0)
          ? (aboutRaw.paragraphs as string[]).filter(p => typeof p === 'string' && p.trim().length > 0)
          : DEFAULT_SITE_CONTENT.about.paragraphs
    },
    committees: pickSection('committees'),
    schedule: pickSection('schedule'),
    faq: pickSection('faq'),
    register: pickSection('register'),
    settings: {
      site_name:
        typeof settingsRaw?.site_name === 'string' && settingsRaw.site_name.trim()
          ? settingsRaw.site_name
          : DEFAULT_SITE_CONTENT.settings.site_name,
      registration_open:
        typeof settingsRaw?.registration_open === 'boolean'
          ? settingsRaw.registration_open
          : DEFAULT_SITE_CONTENT.settings.registration_open,
      contact_email: typeof settingsRaw?.contact_email === 'string' ? settingsRaw.contact_email : ''
    }
  };
}

export function canMemberViewAnnouncement(
  announcement: Pick<AnnouncementRow, 'audience' | 'target_department'>,
  profile: Pick<ProfileRow, 'role' | 'department' | 'active'>
): boolean {
  if (!profile.active) return false;
  if (profile.role === 'admin') return true;
  if (announcement.audience === 'all') return true;
  if (announcement.audience === 'heads') {
    return profile.role === 'head';
  }
  if (announcement.audience === 'department') {
    const target = (announcement.target_department || '').trim().toLowerCase();
    const mine = profile.department.trim().toLowerCase();
    return target.length > 0 && target === mine;
  }
  return false;
}

export function sanitizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

export function reorderList<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length || fromIndex === toIndex) {
    return items;
  }
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}
