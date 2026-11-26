import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { authenticateRequest, getServiceClient, isHrAuthorized, randomTokenHex, sha256Hex } from '../_shared/auth.ts';
import { handlePreflight, jsonResponse } from '../_shared/cors.ts';

function normalizeEmail(raw: unknown): string {
  return String(raw || '').trim().toLowerCase();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  if (local.length <= 2) return `${local[0] || '*'}*@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function inferRoleFromInvite(assignedRole: string, position: string): 'member' | 'head' | 'admin' {
  if (assignedRole === 'admin') return 'admin';
  if (assignedRole === 'head' || /head/i.test(position)) return 'head';
  return 'member';
}

serve(async (req: Request) => {
  const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS');
  if (req.method === 'OPTIONS') {
    return handlePreflight(req, allowedOrigins);
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed.' }, 405, allowedOrigins);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON request body.' }, 400, allowedOrigins);
  }

  const action = String(body.action || '').trim();
  const appOrigin = (Deno.env.get('PUBLIC_APP_URL') || req.headers.get('origin') || '').replace(/\/+$/, '');

  // Public Token Inspection (/invite#token=...)
  if (action === 'inspect_invite') {
    const rawToken = String(body.token || '').trim();
    if (rawToken.length < 16) {
      return jsonResponse(req, { valid: false, error: 'Invalid or incomplete invitation token.' }, 400, allowedOrigins);
    }

    const tokenHash = await sha256Hex(rawToken);
    const service = getServiceClient();

    let { data: invite } = await service
      .from('signup_invites')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!invite) {
      const { data: legacy } = await service
        .from('signup_invite_tokens')
        .select('invite_id')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (legacy?.invite_id) {
        const res = await service.from('signup_invites').select('*').eq('id', legacy.invite_id).maybeSingle();
        invite = res.data;
      }
    }

    if (!invite) {
      return jsonResponse(req, { valid: false, error: 'Invitation link was not found.' }, 404, allowedOrigins);
    }
    if (invite.revoked_at) {
      return jsonResponse(req, { valid: false, error: 'This invitation link has been revoked.' }, 410, allowedOrigins);
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return jsonResponse(req, { valid: false, error: 'This invitation link has expired.' }, 410, allowedOrigins);
    }
    if (invite.use_count >= invite.max_uses) {
      return jsonResponse(req, { valid: false, error: 'This invitation has already been claimed. Please sign in at /login.' }, 409, allowedOrigins);
    }

    // Re-verify live accepted status for applicant personal invites
    if (invite.invite_kind === 'applicant_personal' && invite.application_id) {
      const { data: appRow } = await service
        .from('applications')
        .select('status')
        .eq('id', invite.application_id)
        .maybeSingle();
      if (!appRow || appRow.status !== 'accepted') {
        return jsonResponse(
          req,
          { valid: false, error: 'This application is no longer in accepted status.' },
          403,
          allowedOrigins
        );
      }
    }

    return jsonResponse(
      req,
      {
        valid: true,
        invite: {
          id: invite.id,
          invite_kind: invite.invite_kind,
          recipient_name: invite.recipient_name,
          email_masked: invite.recipient_email ? maskEmail(invite.recipient_email) : '',
          email_locked: Boolean(invite.recipient_email),
          department: invite.department,
          position: invite.position,
          assigned_role: invite.assigned_role,
          section: invite.section
        }
      },
      200,
      allowedOrigins
    );
  }

  // Public Token Claim (/invite#token=...)
  if (action === 'claim_invite') {
    const rawToken = String(body.token || '').trim();
    const password = String(body.password || '');
    const suppliedEmail = normalizeEmail(body.email);
    const suppliedName = String(body.full_name || '').trim();

    if (rawToken.length < 16) {
      return jsonResponse(req, { error: 'Invalid invitation token.' }, 400, allowedOrigins);
    }
    if (password.length < 6) {
      return jsonResponse(req, { error: 'Password must be at least 6 characters long.' }, 400, allowedOrigins);
    }

    const tokenHash = await sha256Hex(rawToken);
    const service = getServiceClient();

    let { data: invite } = await service
      .from('signup_invites')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!invite) {
      const { data: legacy } = await service
        .from('signup_invite_tokens')
        .select('invite_id')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (legacy?.invite_id) {
        const res = await service.from('signup_invites').select('*').eq('id', legacy.invite_id).maybeSingle();
        invite = res.data;
      }
    }

    if (!invite) {
      return jsonResponse(req, { error: 'Invitation link not found.' }, 404, allowedOrigins);
    }
    if (invite.revoked_at) {
      return jsonResponse(req, { error: 'This invitation link has been revoked.' }, 410, allowedOrigins);
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
      return jsonResponse(req, { error: 'This invitation link has expired.' }, 410, allowedOrigins);
    }
    if (invite.use_count >= invite.max_uses) {
      return jsonResponse(req, { error: 'This invitation has already been claimed. Sign in at /login.' }, 409, allowedOrigins);
    }

    if (invite.invite_kind === 'applicant_personal' && invite.application_id) {
      const { data: appRow } = await service
        .from('applications')
        .select('status')
        .eq('id', invite.application_id)
        .maybeSingle();
      if (!appRow || appRow.status !== 'accepted') {
        return jsonResponse(req, { error: 'Only accepted applicants can claim this invitation.' }, 403, allowedOrigins);
      }
    }

    const targetEmail = invite.recipient_email ? normalizeEmail(invite.recipient_email) : suppliedEmail;
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetEmail)) {
      return jsonResponse(req, { error: 'Enter a valid email address.' }, 400, allowedOrigins);
    }
    if (invite.recipient_email && suppliedEmail && suppliedEmail !== normalizeEmail(invite.recipient_email)) {
      return jsonResponse(req, { error: 'Email does not match this personal invitation.' }, 403, allowedOrigins);
    }

    const targetName = invite.recipient_name || suppliedName || targetEmail.split('@')[0];

    // Never overwrite or reset an existing user's password!
    const { data: existingProfile } = await service
      .from('profiles')
      .select('id, email')
      .eq('email', targetEmail)
      .maybeSingle();

    if (existingProfile) {
      return jsonResponse(
        req,
        {
          error:
            'An account with this email already exists. Original passwords are always preserved — sign in at /login instead.'
        },
        409,
        allowedOrigins
      );
    }

    // Optimistic claim lock for single-use invites
    const claimId = crypto.randomUUID();
    const isSingleUse = invite.max_uses === 1;
    if (isSingleUse) {
      const { data: lockRows, error: lockErr } = await service
        .from('signup_invites')
        .update({ claim_id: claimId })
        .eq('id', invite.id)
        .is('claim_id', null)
        .lt('use_count', invite.max_uses)
        .select('id');
      if (lockErr || !lockRows?.length) {
        return jsonResponse(req, { error: 'This invitation is currently being claimed or was already used.' }, 409, allowedOrigins);
      }
    }

    try {
      // Step 1: Upsert roster record so trg_enforce_roster_on_signup passes cleanly
      const roleToAssign = inferRoleFromInvite(invite.assigned_role, invite.position);
      const { data: rosterRow, error: rosterErr } = await service
        .from('roster')
        .upsert(
          {
            full_name: targetName,
            email: targetEmail,
            department: invite.department || '',
            position: invite.position || 'Member'
          },
          { onConflict: 'email' }
        )
        .select('id')
        .single();

      if (rosterErr) {
        throw new Error(rosterErr.message);
      }

      // Step 2: Create verified Supabase Auth user
      const { data: authCreated, error: authErr } = await service.auth.admin.createUser({
        email: targetEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: targetName,
          department: invite.department || '',
          position: invite.position || 'Member'
        }
      });

      if (authErr || !authCreated?.user) {
        throw new Error(authErr?.message || 'Could not create Supabase auth user.');
      }

      const newUserId = authCreated.user.id;

      // Step 3: Ensure profile carries exact role, rank, section, and active state
      await service
        .from('profiles')
        .upsert(
          {
            id: newUserId,
            roster_id: rosterRow.id,
            email: targetEmail,
            full_name: targetName,
            department: invite.department || '',
            position: invite.position || 'Member',
            role: roleToAssign,
            eb_rank: invite.eb_rank || (roleToAssign === 'head' ? 'head' : roleToAssign === 'admin' ? 'executive' : 'member'),
            section: invite.section || '',
            active: true
          },
          { onConflict: 'id' }
        );

      // Step 4: Finalize invite usage
      await service
        .from('signup_invites')
        .update({
          use_count: (invite.use_count || 0) + 1,
          claimed_at: new Date().toISOString(),
          claimed_by: newUserId,
          claim_id: isSingleUse ? claimId : null
        })
        .eq('id', invite.id);

      await service.from('audit_log').insert({
        user_id: newUserId,
        user_email: targetEmail,
        action: 'invite_claimed',
        details: {
          invite_id: invite.id,
          invite_kind: invite.invite_kind,
          department: invite.department,
          position: invite.position,
          role: roleToAssign
        }
      });

      return jsonResponse(
        req,
        {
          ok: true,
          email: targetEmail,
          role: roleToAssign,
          message: 'Your Veritas MUN portal account is ready. Sign in now.'
        },
        200,
        allowedOrigins
      );
    } catch (ex: any) {
      if (isSingleUse) {
        await service.from('signup_invites').update({ claim_id: null }).eq('id', invite.id).eq('claim_id', claimId);
      }
      return jsonResponse(req, { error: ex?.message || 'Invite claim failed.' }, 400, allowedOrigins);
    }
  }

  // Authenticated HR / Admin actions below
  const auth = await authenticateRequest(req);
  if (!auth.ctx) {
    return jsonResponse(req, { error: auth.error }, auth.status || 401, allowedOrigins);
  }
  const { ctx } = auth;
  if (!isHrAuthorized(ctx.profile)) {
    return jsonResponse(req, { error: 'HR or Executive Board authorization required.' }, 403, allowedOrigins);
  }

  if (action === 'create_applicant_invites') {
    const applicationIds: string[] = Array.isArray(body.application_ids)
      ? body.application_ids.map((x: unknown) => String(x))
      : body.application_id
        ? [String(body.application_id)]
        : [];
    if (!applicationIds.length) {
      return jsonResponse(req, { error: 'Provide one or more accepted application_ids.' }, 400, allowedOrigins);
    }

    const { data: apps, error: appsErr } = await ctx.serviceClient
      .from('applications')
      .select('id, full_name, email, track, gender, status')
      .in('id', applicationIds);

    if (appsErr) {
      return jsonResponse(req, { error: appsErr.message }, 400, allowedOrigins);
    }

    const created: Array<{ application_id: string; invite_id: string; email: string; invite_url: string }> = [];
    const skipped: Array<{ application_id: string; reason: string }> = [];

    for (const app of apps || []) {
      if (app.status !== 'accepted') {
        skipped.push({ application_id: app.id, reason: `Status is "${app.status}", must be "accepted".` });
        continue;
      }

      const rawToken = `vm_inv_${randomTokenHex(24)}`;
      const tokenHash = await sha256Hex(rawToken);
      const tokenPreview = `${rawToken.slice(0, 12)}...${rawToken.slice(-4)}`;
      const inviteUrl = `${appOrigin || 'https://veritasmun.vercel.app'}/invite#token=${rawToken}`;

      // Check existing unclaimed invite for this application — preserve prior tokens in signup_invite_tokens
      const { data: existing } = await ctx.serviceClient
        .from('signup_invites')
        .select('id, token_hash, token_preview')
        .eq('application_id', app.id)
        .is('revoked_at', null)
        .lt('use_count', 1)
        .maybeSingle();

      let inviteId: string;
      if (existing) {
        if (existing.token_hash) {
          await ctx.serviceClient
            .from('signup_invite_tokens')
            .upsert(
              {
                invite_id: existing.id,
                token_hash: existing.token_hash,
                token_preview: existing.token_preview || ''
              },
              { onConflict: 'token_hash' }
            );
        }
        await ctx.serviceClient
          .from('signup_invites')
          .update({ token_hash: tokenHash, token_preview: tokenPreview })
          .eq('id', existing.id);
        inviteId = existing.id;
      } else {
        const { data: ins, error: insErr } = await ctx.serviceClient
          .from('signup_invites')
          .insert({
            invite_kind: 'applicant_personal',
            application_id: app.id,
            token_hash: tokenHash,
            token_preview: tokenPreview,
            recipient_email: normalizeEmail(app.email),
            recipient_name: app.full_name,
            department: app.track || 'Volunteers',
            position: `${app.track || 'Department'} Member`,
            assigned_role: 'member',
            eb_rank: 'member',
            section: app.gender || '',
            max_uses: 1,
            expires_at: null,
            created_by: ctx.userId
          })
          .select('id')
          .single();
        if (insErr) {
          skipped.push({ application_id: app.id, reason: insErr.message });
          continue;
        }
        inviteId = ins.id;
      }

      created.push({
        application_id: app.id,
        invite_id: inviteId,
        email: normalizeEmail(app.email),
        invite_url: inviteUrl
      });
    }

    await ctx.serviceClient.from('audit_log').insert({
      user_id: ctx.userId,
      user_email: ctx.email,
      action: 'hr_invites_created',
      details: { count: created.length, skipped: skipped.length }
    });

    return jsonResponse(req, { ok: true, created, skipped }, 200, allowedOrigins);
  }

  if (action === 'create_eb_invite') {
    if (ctx.profile.role !== 'admin') {
      return jsonResponse(req, { error: 'Only Administrators can issue Executive Board or Admin invites.' }, 403, allowedOrigins);
    }
    const inviteKind = body.reusable ? 'eb_reusable' : 'eb_email';
    const email = normalizeEmail(body.email);
    const fullName = String(body.full_name || '').trim();
    const department = String(body.department || '').trim();
    const position = String(body.position || 'Head').trim();
    const assignedRole = ['member', 'head', 'admin'].includes(body.assigned_role) ? body.assigned_role : 'head';
    const maxUses = body.reusable ? Math.min(100, Math.max(2, Number(body.max_uses) || 10)) : 1;

    if (inviteKind === 'eb_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return jsonResponse(req, { error: 'Enter a valid email address for email-locked invite.' }, 400, allowedOrigins);
    }

    const rawToken = `vm_eb_${randomTokenHex(24)}`;
    const tokenHash = await sha256Hex(rawToken);
    const tokenPreview = `${rawToken.slice(0, 12)}...${rawToken.slice(-4)}`;
    const inviteUrl = `${appOrigin || 'https://veritasmun.vercel.app'}/invite#token=${rawToken}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: created, error: insErr } = await ctx.serviceClient
      .from('signup_invites')
      .insert({
        invite_kind: inviteKind,
        token_hash: tokenHash,
        token_preview: tokenPreview,
        recipient_email: email,
        recipient_name: fullName,
        department,
        position,
        assigned_role: assignedRole,
        eb_rank: assignedRole === 'admin' ? 'executive' : assignedRole === 'head' ? 'head' : 'member',
        max_uses: maxUses,
        expires_at: expiresAt,
        created_by: ctx.userId
      })
      .select('*')
      .single();

    if (insErr) {
      return jsonResponse(req, { error: insErr.message }, 400, allowedOrigins);
    }

    await ctx.serviceClient.from('audit_log').insert({
      user_id: ctx.userId,
      user_email: ctx.email,
      action: 'eb_invite_created',
      details: { invite_id: created.id, invite_kind: inviteKind, department, assigned_role: assignedRole }
    });

    return jsonResponse(req, { ok: true, invite: created, invite_url: inviteUrl }, 200, allowedOrigins);
  }

  if (action === 'revoke_invite') {
    const inviteId = String(body.invite_id || '').trim();
    if (!inviteId) {
      return jsonResponse(req, { error: 'invite_id is required.' }, 400, allowedOrigins);
    }
    const { error } = await ctx.serviceClient
      .from('signup_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId);
    if (error) {
      return jsonResponse(req, { error: error.message }, 400, allowedOrigins);
    }
    return jsonResponse(req, { ok: true }, 200, allowedOrigins);
  }

  return jsonResponse(req, { error: `Unknown invite action "${action}".` }, 400, allowedOrigins);
});
