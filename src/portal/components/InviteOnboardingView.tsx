import React, { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { extractInviteTokenFromUrl } from '../../utils/managementLogic';
import { MIN_AUTH_PASSWORD_LENGTH } from '../../utils/portalAuthLogic';
import { invokeEdgeFunction } from './invokeEdgeFunction';

interface InviteOnboardingViewProps {
  sb: any;
  pathname: string;
}

interface InspectedInvite {
  id: string;
  invite_kind: 'applicant_personal' | 'eb_email' | 'eb_reusable';
  recipient_name: string;
  email_masked: string;
  email_locked: boolean;
  department: string;
  position: string;
  assigned_role: string;
  section?: string;
}

export const InviteOnboardingView: React.FC<InviteOnboardingViewProps> = ({ sb, pathname }) => {
  const [token, setToken] = useState<string>(() =>
    extractInviteTokenFromUrl(location.search, location.hash)
  );
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InspectedInvite | null>(null);
  const [inspectError, setInspectError] = useState('');

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [claimedInfo, setClaimedInfo] = useState<{ email: string; role: string; message: string } | null>(null);

  useEffect(() => {
    const syncToken = () => {
      const next = extractInviteTokenFromUrl(location.search, location.hash);
      if (next) setToken(next);
    };
    window.addEventListener('hashchange', syncToken);
    return () => window.removeEventListener('hashchange', syncToken);
  }, []);

  useEffect(() => {
    let active = true;
    const inspect = async () => {
      if (!token || token.length < 16) {
        if (active) {
          setLoading(false);
          setInvite(null);
          setInspectError(
            pathname === '/eb-signup'
              ? 'Open the full Executive Board invitation link sent by the Secretariat or IT (including #token=...).'
              : 'Invitation token is missing or incomplete. Check the personal onboarding link from Veritas MUN HR.'
          );
        }
        return;
      }

      setLoading(true);
      setInspectError('');
      const { data, error } = await invokeEdgeFunction<{ valid?: boolean; invite?: InspectedInvite; error?: string }>(
        sb,
        'veritas-invites',
        { action: 'inspect_invite', token }
      );
      if (!active) return;

      if (error || !data?.valid || !data?.invite) {
        setInvite(null);
        setInspectError(error || data?.error || 'This invitation link is invalid or has already been used.');
      } else {
        setInvite(data.invite);
        setFullName(data.invite.recipient_name || '');
      }
      setLoading(false);
    };

    void inspect();
    return () => {
      active = false;
    };
  }, [sb, token, pathname]);

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setSubmitError('Enter a valid email address.');
      return;
    }
    if (!invite?.recipient_name && !fullName.trim()) {
      setSubmitError('Enter your full name.');
      return;
    }
    if (!password || password.length < MIN_AUTH_PASSWORD_LENGTH) {
      setSubmitError(`Password must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await invokeEdgeFunction<{
        ok?: boolean;
        email?: string;
        role?: string;
        message?: string;
      }>(sb, 'veritas-invites', {
        action: 'claim_invite',
        token,
        email: cleanEmail,
        full_name: fullName.trim(),
        password
      });

      if (error || !data?.ok) {
        setSubmitError(error || 'Could not activate your portal account.');
        return;
      }

      setClaimedInfo({
        email: data.email || cleanEmail,
        role: data.role || invite?.assigned_role || 'member',
        message: data.message || 'Your Veritas MUN portal account is ready.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="box">
        <h2 style={{ margin: '0 0 8px' }}>Veritas MUN</h2>
        <p style={{ margin: 0 }}>Verifying your invitation link...</p>
      </div>
    );
  }

  if (claimedInfo) {
    return (
      <div className="box">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#2F6B34', marginBottom: 10 }}>
          <CheckCircle2 size={24} />
          <h2 style={{ margin: 0 }}>Account Activated</h2>
        </div>
        <p>{claimedInfo.message}</p>
        <div
          style={{
            padding: '10px 12px',
            background: '#FAF6EE',
            border: '1px solid #BAB1A0',
            marginBottom: 14,
            fontSize: 15
          }}
        >
          <div><strong>Email:</strong> {claimedInfo.email}</div>
          <div><strong>Assigned Role:</strong> {claimedInfo.role}</div>
          <div><strong>Conference Pass:</strong> Automatically provisioned (available in My QR Pass)</div>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <a className="btn" href="/login">Sign in to Veritas MUN Portal</a>
          <a className="btn ghost" href="/">Public site</a>
        </div>
      </div>
    );
  }

  if (inspectError || !invite) {
    return (
      <div className="box">
        <h2 style={{ margin: '0 0 8px' }}>Veritas MUN Onboarding</h2>
        <div className="err" role="alert">{inspectError || 'Invitation unavailable.'}</div>
        <div className="toolbar" style={{ marginTop: 14 }}>
          <a className="btn" href="/login">Go to Sign in</a>
          <a className="btn ghost" href="/">Back to website</a>
        </div>
      </div>
    );
  }

  return (
    <form className="box" onSubmit={handleClaim} style={{ maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2F6B34', marginBottom: 6 }}>
        <ShieldCheck size={18} />
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: 12, letterSpacing: '0.12em', fontWeight: 600 }}>
          VERITAS MUN ONBOARDING
        </span>
      </div>
      <h2 style={{ margin: '0 0 6px' }}>Complete Your Account Setup</h2>
      <p style={{ margin: '0 0 14px', color: '#51464A', fontSize: 16 }}>
        {invite.invite_kind === 'applicant_personal'
          ? 'Your application was accepted. Confirm your email and choose a password to activate your Veritas MUN account and digital QR pass.'
          : 'You have been invited to join the Veritas MUN staff portal.'}
      </p>

      <div
        style={{
          padding: '10px 12px',
          background: '#FAF6EE',
          border: '1px solid #BAB1A0',
          borderLeft: '3px solid #2F6B34',
          marginBottom: 14,
          fontSize: 15
        }}
      >
        {invite.recipient_name && <div><strong>Name:</strong> {invite.recipient_name}</div>}
        {invite.email_masked && <div><strong>Reserved Email:</strong> {invite.email_masked}</div>}
        <div><strong>Department:</strong> {invite.department || 'General'}</div>
        <div><strong>Position:</strong> {invite.position || 'Member'} ({invite.assigned_role})</div>
      </div>

      {!invite.recipient_name && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor="invite-full-name">Full Name<span className="req" aria-hidden="true">*</span></label>
          <input
            id="invite-full-name"
            required
            placeholder="Your full name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
          />
        </div>
      )}

      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor="invite-email">
          {invite.email_locked ? 'Confirm Invited Email Address' : 'Your Email Address'}
          <span className="req" aria-hidden="true">*</span>
        </label>
        <input
          id="invite-email"
          type="email"
          required
          autoComplete="email"
          placeholder={invite.email_locked ? 'Enter the invited email address' : 'you@example.com'}
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor="invite-pw">
          Create Password (min {MIN_AUTH_PASSWORD_LENGTH} characters)<span className="req" aria-hidden="true">*</span>
        </label>
        <input
          id="invite-pw"
          type="password"
          required
          minLength={MIN_AUTH_PASSWORD_LENGTH}
          autoComplete="new-password"
          placeholder="Choose your password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label htmlFor="invite-pw2">Repeat Password<span className="req" aria-hidden="true">*</span></label>
        <input
          id="invite-pw2"
          type="password"
          required
          minLength={MIN_AUTH_PASSWORD_LENGTH}
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
        />
      </div>

      {submitError && (
        <div className="err" role="alert">
          {submitError}
        </div>
      )}

      <div className="toolbar" style={{ margin: '12px 0 0' }}>
        <button type="submit" className="btn" disabled={submitting}>
          <KeyRound size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {submitting ? 'Creating Account...' : 'Activate Account & QR Pass'}
        </button>
        <a className="btn ghost" href="/login">Sign in instead</a>
      </div>
    </form>
  );
};
