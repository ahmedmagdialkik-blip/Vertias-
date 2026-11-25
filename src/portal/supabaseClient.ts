import { createClient } from '@supabase/supabase-js';

// Publishable browser key; authorization and data isolation are strictly enforced by Postgres RLS & triggers.
const SUPABASE_URL = 'https://iaionntcwjblvndmdesw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1Qg2Z-_1-QvviWwr-ZM9_w_3nmqnxX7';

export const PROOFS_BUCKET = 'application-proofs';
export const TEAM_PHOTOS_BUCKET = 'team-photos';

export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export interface PortalProfile {
  id: string;
  roster_id: string | null;
  email: string;
  full_name: string;
  department: string;
  position: string;
  role: 'member' | 'head' | 'admin';
  active: boolean;
  created_at: string;
}

export interface ProofFileMeta {
  name?: string;
  path?: string;
  size?: number;
  mimeType?: string;
}

export interface PortalApplication {
  id: string;
  track: string;
  full_name: string;
  email: string;
  phone: string;
  emergency_contact: string;
  gender: string;
  school: string;
  grade: string;
  experience: string;
  proof_urls: Array<ProofFileMeta | string>;
  why: string;
  role_understanding: string;
  fight_precautions: string;
  rules_enforcement: string;
  attend_all_days: boolean;
  issues_note: string;
  status: 'pending' | 'accepted' | 'rejected';
  recommendation: 'accept' | 'reject' | null;
  recommendation_note: string;
  recommended_by: string | null;
  recommended_at: string | null;
  decision_note: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface PortalRosterEntry {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  notes: string;
  created_at: string;
}

export interface PortalTeamCard {
  id: string;
  full_name: string;
  title: string;
  photo_url: string;
  sort_order: number;
  visible: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PortalAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'department' | 'heads';
  target_department: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PortalSiteContentRow {
  id?: string;
  key: string;
  value: unknown;
  updated_at?: string;
}

export interface PortalAuditEntry {
  id: string;
  user_id: string | null;
  user_email: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export async function recordPortalAuditLog(
  userId: string | null | undefined,
  userEmail: string | null | undefined,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await sb.from('audit_log').insert({
      user_id: userId ?? null,
      user_email: userEmail ?? '',
      action,
      details
    });
  } catch {
    // Non-blocking audit log write
  }
}
