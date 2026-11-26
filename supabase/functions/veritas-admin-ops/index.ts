import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authenticateRequest } from '../_shared/auth.ts';
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
  if (ctx.profile.role !== 'admin') {
    return jsonResponse(req, { error: 'Executive Board administrator access required.' }, 403, allowedOrigins);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON request body.' }, 400, allowedOrigins);
  }

  const action = String(body.action || '').trim();

  if (action === 'update_account') {
    const targetId = String(body.target_user_id || '').trim();
    if (!targetId) {
      return jsonResponse(req, { error: 'target_user_id is required.' }, 400, allowedOrigins);
    }
    if (targetId === ctx.userId && body.active === false) {
      return jsonResponse(req, { error: 'You cannot suspend your own active administrator account.' }, 400, allowedOrigins);
    }

    const patch: Record<string, unknown> = {};
    if (['member', 'head', 'admin'].includes(body.role)) patch.role = body.role;
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (typeof body.department === 'string') patch.department = body.department.trim();
    if (typeof body.position === 'string') patch.position = body.position.trim();
    if (typeof body.section === 'string') patch.section = body.section.trim();
    if (['member', 'co_head', 'head', 'executive'].includes(body.eb_rank)) patch.eb_rank = body.eb_rank;
    if (body.permissions && typeof body.permissions === 'object') patch.permissions = body.permissions;
    if (typeof body.suspended_reason === 'string') patch.suspended_reason = body.suspended_reason.trim();

    const { data: updated, error: updErr } = await ctx.serviceClient
      .from('profiles')
      .update(patch)
      .eq('id', targetId)
      .select('id, email, full_name, department, position, role, eb_rank, section, permissions, active, suspended_reason')
      .single();

    if (updErr) {
      return jsonResponse(req, { error: updErr.message }, 400, allowedOrigins);
    }

    // Enforce Supabase Auth session suspension/reactivation cleanly without altering the user's password!
    if (typeof body.active === 'boolean') {
      await ctx.serviceClient.auth.admin.updateUserById(targetId, {
        ban_duration: body.active ? 'none' : '876000h'
      });
    }

    await ctx.serviceClient.from('audit_log').insert({
      user_id: ctx.userId,
      user_email: ctx.email,
      action: 'admin_account_updated',
      details: { target_user_id: targetId, target_email: updated.email, patch }
    });

    if (typeof body.active === 'boolean' && body.active === false) {
      await ctx.serviceClient.from('security_events').insert({
        actor_user_id: ctx.userId,
        actor_email: ctx.email,
        event_type: 'account_suspended',
        severity: 'warning',
        summary: `Suspended account ${updated.email}${patch.suspended_reason ? `: ${patch.suspended_reason}` : ''}`,
        metadata: { target_user_id: targetId }
      });
    }

    return jsonResponse(req, { ok: true, profile: updated }, 200, allowedOrigins);
  }

  if (action === 'send_password_recovery') {
    const email = String(body.email || '').trim().toLowerCase();
    const redirectTo = String(body.redirect_to || '').trim() || undefined;
    if (!email) {
      return jsonResponse(req, { error: 'Target user email is required.' }, 400, allowedOrigins);
    }

    // Trigger standard Supabase recovery email without exposing or setting any password
    const { error } = await ctx.serviceClient.auth.resetPasswordForEmail(email, {
      redirectTo
    });
    if (error) {
      return jsonResponse(req, { error: error.message }, 400, allowedOrigins);
    }

    await ctx.serviceClient.from('audit_log').insert({
      user_id: ctx.userId,
      user_email: ctx.email,
      action: 'admin_triggered_password_recovery',
      details: { target_email: email }
    });

    return jsonResponse(req, { ok: true, message: `Password recovery email requested for ${email}.` }, 200, allowedOrigins);
  }

  return jsonResponse(req, { error: `Unknown admin ops action "${action}".` }, 400, allowedOrigins);
});
