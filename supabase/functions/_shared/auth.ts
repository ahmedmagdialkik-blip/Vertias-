// Shared authentication, SHA-256 hashing, and profile permission verification for Veritas MUN Edge Functions
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in the Edge runtime environment.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export interface EdgeAuthContext {
  userId: string;
  email: string;
  profile: {
    id: string;
    email: string;
    full_name: string;
    department: string;
    position: string;
    role: 'member' | 'head' | 'admin';
    eb_rank?: string;
    section?: string;
    permissions?: Record<string, boolean>;
    active: boolean;
  };
  userClient: any;
  serviceClient: any;
}

export function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function environment.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function sha256Hex(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function randomTokenHex(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function authenticateRequest(req: Request): Promise<{ ctx?: EdgeAuthContext; error?: string; status?: number }> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { error: 'Missing bearer authorization token.', status: 401 };
  }

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!url || !anonKey) {
    return { error: 'Missing Supabase runtime configuration.', status: 500 };
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return { error: 'Invalid or expired authentication session.', status: 401 };
  }

  const serviceClient = getServiceClient();
  const { data: profile, error: profErr } = await serviceClient
    .from('profiles')
    .select('id, email, full_name, department, position, role, eb_rank, section, permissions, active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profErr || !profile) {
    return { error: 'User profile not found.', status: 403 };
  }
  if (!profile.active) {
    return { error: 'Account is currently inactive or suspended.', status: 403 };
  }

  return {
    ctx: {
      userId: userData.user.id,
      email: (userData.user.email || profile.email || '').toLowerCase(),
      profile,
      userClient,
      serviceClient
    }
  };
}

export function hasPerm(profile: EdgeAuthContext['profile'], key: string): boolean {
  if (profile.role === 'admin') return true;
  return Boolean(profile.permissions && profile.permissions[key] === true);
}

export function isHrAuthorized(profile: EdgeAuthContext['profile']): boolean {
  if (profile.role === 'admin' || hasPerm(profile, 'hr_invites')) return true;
  return (
    profile.role === 'head' &&
    /(^|[^a-z])hr([^a-z]|$)|human resources/i.test(profile.department || '')
  );
}

export function isEmailAuthorized(profile: EdgeAuthContext['profile']): boolean {
  return profile.role === 'admin' || hasPerm(profile, 'email_manage') || isHrAuthorized(profile);
}

export function isScannerAuthorized(profile: EdgeAuthContext['profile']): boolean {
  if (profile.role === 'admin' || hasPerm(profile, 'qr_scanner')) return true;
  return /security/i.test(profile.department || '');
}
