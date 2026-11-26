import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authenticateRequest, isScannerAuthorized } from '../_shared/auth.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

serve(async (req: Request) => {
  const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS');
  if (req.method === 'OPTIONS') {
    return handlePreflight(req, allowedOrigins);
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed.' }, 405, allowedOrigins);
  }

  const auth = await authenticateRequest(req);
  if (!auth.ctx) {
    return jsonResponse(req, { error: auth.error }, auth.status || 401, allowedOrigins);
  }
  const { ctx } = auth;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON request body.' }, 400, allowedOrigins);
  }

  const action = String(body.action || '').trim();

  if (action === 'my_pass') {
    const { data, error } = await ctx.userClient
      .from('qr_passes')
      .select('*')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (error) {
      return jsonResponse(req, { error: error.message }, 400, allowedOrigins);
    }
    return jsonResponse(req, { pass: data || null }, 200, allowedOrigins);
  }

  if (action === 'scan_check_in' || action === 'scan_check_out') {
    if (!isScannerAuthorized(ctx.profile)) {
      await ctx.serviceClient.from('security_events').insert({
        actor_user_id: ctx.userId,
        actor_email: ctx.email,
        event_type: 'unauthorized_qr_scan_attempt',
        severity: 'warning',
        summary: `Blocked unauthorized QR scan attempt by ${ctx.email} (${ctx.profile.department || ctx.profile.role}).`
      });
      return jsonResponse(req, { error: 'QR scanner is restricted to Administrators and Security team.' }, 403, allowedOrigins);
    }

    const token = String(body.token || '').trim();
    const gate = String(body.gate || 'Main Gate').trim();
    const rpcName = action === 'scan_check_in' ? 'atomic_qr_checkin' : 'atomic_qr_checkout';
    const { data, error } = await ctx.userClient.rpc(rpcName, { p_token: token, p_gate: gate });
    if (error) {
      return jsonResponse(req, { error: error.message }, 400, allowedOrigins);
    }
    return jsonResponse(req, data, 200, allowedOrigins);
  }

  if (action === 'manual_correct') {
    if (ctx.profile.role !== 'admin') {
      return jsonResponse(req, { error: 'Administrator privileges required for manual attendance correction.' }, 403, allowedOrigins);
    }
    const { data, error } = await ctx.userClient.rpc('manual_correct_qr_pass', {
      p_pass_id: String(body.pass_id || ''),
      p_action: String(body.correction_action || ''),
      p_reason: String(body.reason || '')
    });
    if (error) {
      return jsonResponse(req, { error: error.message }, 400, allowedOrigins);
    }
    return jsonResponse(req, { ok: true, pass: data }, 200, allowedOrigins);
  }

  if (action === 'reset_all') {
    if (ctx.profile.role !== 'admin') {
      return jsonResponse(req, { error: 'Administrator privileges required for global attendance reset.' }, 403, allowedOrigins);
    }
    const { data, error } = await ctx.userClient.rpc('reset_all_qr_attendance', {
      p_confirmation: String(body.confirmation || ''),
      p_reason: String(body.reason || '')
    });
    if (error) {
      return jsonResponse(req, { error: error.message }, 400, allowedOrigins);
    }
    return jsonResponse(req, data, 200, allowedOrigins);
  }

  return jsonResponse(req, { error: `Unknown QR action "${action}".` }, 400, allowedOrigins);
});
