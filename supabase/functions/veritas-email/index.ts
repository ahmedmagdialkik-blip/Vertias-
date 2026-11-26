import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authenticateRequest, isEmailAuthorized } from '../_shared/auth.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
  });
}

async function dispatchViaResend(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = (Deno.env.get('RESEND_API_KEY') || '').trim();
  const from = (Deno.env.get('EMAIL_FROM') || '').trim();

  if (!apiKey || !from) {
    return {
      ok: false,
      error: 'RESEND_API_KEY or EMAIL_FROM is not configured on Supabase Edge Functions. Use "Open in Gmail" + "Mark as Sent" or configure Resend secrets.'
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html || undefined
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: data?.message || data?.error || `Resend returned HTTP ${res.status}`
      };
    }
    return { ok: true, id: data?.id || '' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error dispatching via Resend.' };
  }
}

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
  if (!isEmailAuthorized(ctx.profile)) {
    return jsonResponse(req, { error: 'Email management access requires Administrator or HR permissions.' }, 403, allowedOrigins);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON body.' }, 400, allowedOrigins);
  }

  const action = String(body.action || '').trim();
  const resendConfigured = Boolean((Deno.env.get('RESEND_API_KEY') || '').trim() && (Deno.env.get('EMAIL_FROM') || '').trim());

  if (action === 'provider_status') {
    return jsonResponse(req, { resend_configured: resendConfigured }, 200, allowedOrigins);
  }

  if (action === 'send_email') {
    const recipientEmail = String(body.recipient_email || '').trim().toLowerCase();
    const recipientName = String(body.recipient_name || '').trim();
    const subject = String(body.subject || '').trim();
    const bodyText = String(body.body_text || '').trim();
    const templateKey = String(body.template_key || '').trim();
    const applicationId = body.application_id ? String(body.application_id) : null;
    const inviteId = body.invite_id ? String(body.invite_id) : null;

    if (!recipientEmail || !subject || !bodyText) {
      return jsonResponse(req, { error: 'recipient_email, subject, and body_text are required.' }, 400, allowedOrigins);
    }

    const { data: queued, error: qErr } = await ctx.serviceClient
      .from('email_deliveries')
      .insert({
        application_id: applicationId,
        invite_id: inviteId,
        template_key: templateKey,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        subject,
        body_text: bodyText,
        status: 'queued',
        provider: 'resend',
        attempts: 1,
        sent_by: ctx.userId
      })
      .select('*')
      .single();

    if (qErr) {
      return jsonResponse(req, { error: qErr.message }, 400, allowedOrigins);
    }

    const result = await dispatchViaResend({ to: recipientEmail, subject, text: bodyText });
    const nextStatus = result.ok ? 'sent' : 'failed';

    const { data: updated } = await ctx.serviceClient
      .from('email_deliveries')
      .update({
        status: nextStatus,
        provider_message_id: result.id || '',
        error_message: result.error || '',
        sent_at: result.ok ? new Date().toISOString() : null
      })
      .eq('id', queued.id)
      .select('*')
      .single();

    if (applicationId) {
      await ctx.serviceClient
        .from('applications')
        .update({
          email_status: nextStatus,
          email_sent_at: result.ok ? new Date().toISOString() : null
        })
        .eq('id', applicationId);
    }

    return jsonResponse(
      req,
      {
        ok: result.ok,
        delivery: updated || queued,
        resend_configured: resendConfigured,
        error: result.error || null
      },
      200,
      allowedOrigins
    );
  }

  if (action === 'send_application_decision_batch') {
    const applicationIds: string[] = Array.isArray(body.application_ids)
      ? body.application_ids.map((x: unknown) => String(x))
      : [];
    if (!applicationIds.length) {
      return jsonResponse(req, { error: 'Provide application_ids to email.' }, 400, allowedOrigins);
    }

    const [{ data: apps }, { data: templates }] = await Promise.all([
      ctx.serviceClient.from('applications').select('*').in('id', applicationIds),
      ctx.serviceClient.from('email_templates').select('*')
    ]);

    const tplMap = new Map<string, any>();
    for (const t of templates || []) tplMap.set(t.template_key, t);

    const results: any[] = [];
    for (const app of apps || []) {
      const tplKey =
        app.status === 'accepted'
          ? 'application_accepted'
          : app.status === 'waitlisted'
            ? 'application_waitlisted'
            : 'application_rejected';
      const tpl = tplMap.get(tplKey);
      const vars = {
        full_name: app.full_name || 'Applicant',
        department: app.track || 'Department',
        email: app.email || '',
        note: app.decision_note || ''
      };
      const subject = interpolateTemplate(tpl?.subject || `Veritas MUN — ${app.track} Application Update`, vars);
      const bodyText = interpolateTemplate(tpl?.body_text || `Dear ${vars.full_name},\n\nYour application status is: ${app.status}.`, vars);

      const { data: row } = await ctx.serviceClient
        .from('email_deliveries')
        .insert({
          application_id: app.id,
          template_key: tplKey,
          recipient_email: app.email,
          recipient_name: app.full_name,
          subject,
          body_text: bodyText,
          status: 'queued',
          provider: 'resend',
          attempts: 1,
          sent_by: ctx.userId
        })
        .select('*')
        .single();

      const dispatch = await dispatchViaResend({ to: app.email, subject, text: bodyText });
      const st = dispatch.ok ? 'sent' : 'failed';
      await ctx.serviceClient
        .from('email_deliveries')
        .update({
          status: st,
          provider_message_id: dispatch.id || '',
          error_message: dispatch.error || '',
          sent_at: dispatch.ok ? new Date().toISOString() : null
        })
        .eq('id', row.id);

      await ctx.serviceClient
        .from('applications')
        .update({
          email_status: st,
          email_sent_at: dispatch.ok ? new Date().toISOString() : null
        })
        .eq('id', app.id);

      results.push({ id: row.id, email: app.email, status: st, error: dispatch.error || null });
    }

    return jsonResponse(req, { ok: true, results, resend_configured: resendConfigured }, 200, allowedOrigins);
  }

  if (action === 'retry_delivery') {
    const deliveryId = String(body.delivery_id || '').trim();
    if (!deliveryId) {
      return jsonResponse(req, { error: 'delivery_id is required.' }, 400, allowedOrigins);
    }
    const { data: row } = await ctx.serviceClient
      .from('email_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .maybeSingle();
    if (!row) {
      return jsonResponse(req, { error: 'Delivery record not found.' }, 404, allowedOrigins);
    }

    const dispatch = await dispatchViaResend({
      to: row.recipient_email,
      subject: row.subject,
      text: row.body_text
    });
    const st = dispatch.ok ? 'sent' : 'failed';
    const { data: updated } = await ctx.serviceClient
      .from('email_deliveries')
      .update({
        status: st,
        attempts: (row.attempts || 0) + 1,
        provider_message_id: dispatch.id || row.provider_message_id,
        error_message: dispatch.error || '',
        sent_at: dispatch.ok ? new Date().toISOString() : row.sent_at
      })
      .eq('id', row.id)
      .select('*')
      .single();

    return jsonResponse(req, { ok: dispatch.ok, delivery: updated, resend_configured: resendConfigured }, 200, allowedOrigins);
  }

  return jsonResponse(req, { error: `Unknown email action "${action}".` }, 400, allowedOrigins);
});
