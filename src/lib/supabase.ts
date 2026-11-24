import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export async function recordAuditLog(
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  if (!supabase) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return;
    await supabase.from('audit_log').insert({
      user_id: user.id,
      user_email: (user.email || '').toLowerCase(),
      action,
      details
    });
  } catch {
    // Audit logging should never crash UI interaction if transient error occurs
  }
}
