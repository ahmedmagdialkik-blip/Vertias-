export interface CommitteeRecord {
  id: string;
  name: string;
  description: string;
  image_url: string;
  sort_order: number;
  enabled: boolean;
  abbreviation?: string;
  chamber?: string;
  difficulty?: string;
  topics?: string[];
  chair_name?: string;
  vice_chair_name?: string;
  capacity?: number;
  created_at?: string;
  updated_at?: string;
}

export interface TrackApplicationSetting {
  open: boolean;
  visible: boolean;
  button_text: string;
}

export interface ApplicationSettings {
  description: string;
  volunteer: TrackApplicationSetting;
  security: TrackApplicationSetting;
}

export interface PublicTrackView {
  key: 'volunteer' | 'security';
  trackValue: 'Volunteers' | 'Security';
  title: string;
  href: string;
  buttonText: string;
  open: boolean;
  statusLabel: 'OPEN' | 'CLOSED';
}

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = {
  description:
    'Applications for Veritas MUN departments are managed below. Select an open track to submit your experience and supporting proof.',
  volunteer: {
    open: true,
    visible: true,
    button_text: 'Apply as Volunteer'
  },
  security: {
    open: true,
    visible: true,
    button_text: 'Apply as Security'
  }
};

export function sanitizeCommitteeLogoUrl(url: string): string {
  const trimmed = (url || '').trim();
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

export function validateCommitteeInput(input: {
  name: string;
  description: string;
  image_url?: string;
}): string | null {
  const name = (input.name || '').trim();
  const description = (input.description || '').trim();
  const imageUrl = (input.image_url || '').trim();

  if (!name) {
    return 'Committee name is required.';
  }
  if (name.length > 140) {
    return 'Committee name must be 140 characters or fewer.';
  }
  if (!description) {
    return 'Committee description is required.';
  }
  if (imageUrl && !sanitizeCommitteeLogoUrl(imageUrl)) {
    return 'Committee image URL must start with https://, http://, or /.';
  }
  return null;
}

export function sortCommittees<T extends CommitteeRecord>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const orderDiff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    if (orderDiff !== 0) return orderDiff;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export function getPublicCommittees<T extends CommitteeRecord>(rows: readonly T[]): T[] {
  return sortCommittees(rows).filter(
    row => row.enabled !== false && (row.name || '').trim().length > 0
  );
}

export function moveCommitteeOrder<T extends CommitteeRecord>(
  rows: readonly T[],
  targetId: string,
  direction: 'up' | 'down'
): T[] {
  const ordered = sortCommittees(rows);
  const idx = ordered.findIndex(item => item.id === targetId);
  if (idx === -1) return ordered;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) return ordered;

  const copy = [...ordered];
  const temp = copy[idx];
  copy[idx] = copy[swapIdx];
  copy[swapIdx] = temp;

  return copy.map((item, position) => ({
    ...item,
    sort_order: position
  }));
}

export function normalizeCommitteeRows(rows: unknown): CommitteeRecord[] {
  if (!Array.isArray(rows)) return [];
  const clean: CommitteeRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown> | null;
    if (!row || typeof row !== 'object') continue;
    const id = typeof row.id === 'string' && row.id ? row.id : `committee-${i}`;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const description = typeof row.description === 'string' ? row.description.trim() : '';
    const image_url = sanitizeCommitteeLogoUrl(typeof row.image_url === 'string' ? row.image_url : '');
    const sort_order = typeof row.sort_order === 'number' && Number.isFinite(row.sort_order) ? row.sort_order : i;
    const enabled = typeof row.enabled === 'boolean' ? row.enabled : true;
    if (!name) continue;
    const topics = Array.isArray(row.topics)
      ? row.topics.map(t => String(t || '').trim()).filter(Boolean)
      : [];
    const capacity =
      typeof row.capacity === 'number' && Number.isFinite(row.capacity) && row.capacity > 0
        ? Math.floor(row.capacity)
        : undefined;
    clean.push({
      id,
      name,
      description,
      image_url,
      sort_order,
      enabled,
      abbreviation: typeof row.abbreviation === 'string' ? row.abbreviation.trim() : undefined,
      chamber: typeof row.chamber === 'string' ? row.chamber.trim() : undefined,
      difficulty: typeof row.difficulty === 'string' ? row.difficulty.trim() : undefined,
      topics,
      chair_name: typeof row.chair_name === 'string' ? row.chair_name.trim() : undefined,
      vice_chair_name: typeof row.vice_chair_name === 'string' ? row.vice_chair_name.trim() : undefined,
      capacity,
      created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined
    });
  }
  return sortCommittees(clean);
}

export function buildCommitteeLogoStoragePath(name: string, fileName: string, timestamp = Date.now()): string {
  const safeBase = (name || 'committee')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'committee';
  const extMatch = (fileName || '').toLowerCase().match(/\.(png|jpe?g|webp|gif)$/);
  const ext = extMatch ? extMatch[1] : 'png';
  return `committees/${timestamp}-${safeBase}.${ext}`;
}

function normalizeTrackSetting(
  raw: unknown,
  fallback: TrackApplicationSetting
): TrackApplicationSetting {
  if (!raw || typeof raw !== 'object') {
    return { ...fallback };
  }
  const obj = raw as Record<string, unknown>;
  const open = typeof obj.open === 'boolean' ? obj.open : fallback.open;
  const visible = typeof obj.visible === 'boolean' ? obj.visible : fallback.visible;
  const button_text =
    typeof obj.button_text === 'string' && obj.button_text.trim()
      ? obj.button_text.trim()
      : fallback.button_text;

  return { open, visible, button_text };
}

export function normalizeApplicationSettings(raw: unknown): ApplicationSettings {
  if (!raw || typeof raw !== 'object') {
    return {
      description: DEFAULT_APPLICATION_SETTINGS.description,
      volunteer: { ...DEFAULT_APPLICATION_SETTINGS.volunteer },
      security: { ...DEFAULT_APPLICATION_SETTINGS.security }
    };
  }
  const obj = raw as Record<string, unknown>;
  const description =
    typeof obj.description === 'string' && obj.description.trim()
      ? obj.description.trim()
      : DEFAULT_APPLICATION_SETTINGS.description;

  return {
    description,
    volunteer: normalizeTrackSetting(obj.volunteer, DEFAULT_APPLICATION_SETTINGS.volunteer),
    security: normalizeTrackSetting(obj.security, DEFAULT_APPLICATION_SETTINGS.security)
  };
}

export function validateApplicationSettings(settings: ApplicationSettings): string | null {
  if (!settings.description.trim()) {
    return 'Please enter a short description for the public Applications section.';
  }
  if (settings.volunteer.visible && !settings.volunteer.button_text.trim()) {
    return 'Volunteer button text cannot be empty while the Volunteer track is visible.';
  }
  if (settings.security.visible && !settings.security.button_text.trim()) {
    return 'Security button text cannot be empty while the Security track is visible.';
  }
  return null;
}

export function formatTrackStatusLabel(open: boolean): 'OPEN' | 'CLOSED' {
  return open ? 'OPEN' : 'CLOSED';
}

export function isTrackCurrentlyOpen(
  settings: ApplicationSettings,
  track: 'Volunteers' | 'Security'
): boolean {
  return track === 'Volunteers' ? settings.volunteer.open : settings.security.open;
}

export function getVisiblePublicTracks(settings: ApplicationSettings): PublicTrackView[] {
  const tracks: PublicTrackView[] = [];
  if (settings.volunteer.visible) {
    tracks.push({
      key: 'volunteer',
      trackValue: 'Volunteers',
      title: 'Volunteer Applications',
      href: '/apply?track=volunteers',
      buttonText: settings.volunteer.button_text,
      open: settings.volunteer.open,
      statusLabel: formatTrackStatusLabel(settings.volunteer.open)
    });
  }
  if (settings.security.visible) {
    tracks.push({
      key: 'security',
      trackValue: 'Security',
      title: 'Security Applications',
      href: '/apply?track=security',
      buttonText: settings.security.button_text,
      open: settings.security.open,
      statusLabel: formatTrackStatusLabel(settings.security.open)
    });
  }
  return tracks;
}

export function canManageWebsiteOperations(role: string | undefined | null): boolean {
  return role === 'admin';
}
