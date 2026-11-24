import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { PortalFrame } from '../components/PortalFrame';
import { useAuth } from '../context/AuthContext';
import { navigate, RouterLink, useLocationState } from '../lib/router';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { isValidEmailFormat, normalizeEmail } from '../utils/portalLogic';

export const LoginPage: React.FC = () => {
  const { user, loading, recoveryMode, setRecoveryMode, refreshProfile } = useAuth();
  const { search } = useLocationState();
  const params = new URLSearchParams(search);
  const nextPath = params.get('next');
  const queryMode = params.get('mode');

  const isUpdatePasswordView = recoveryMode || queryMode === 'update-password';

  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && !isUpdatePasswordView) {
      const safeTarget = nextPath && nextPath.startsWith('/') ? nextPath : '/account';
      navigate(safeTarget, { replace: true });
    }
  }, [loading, user, isUpdatePasswordView, nextPath]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!supabase) {
      setErrorMsg('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
      return;
    }

    const cleanEmail = normalizeEmail(email);
    if (!isValidEmailFormat(cleanEmail)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });
      if (error) {
        setErrorMsg(error.message || 'Invalid email or password.');
        return;
      }
      await refreshProfile();
      const safeTarget = nextPath && nextPath.startsWith('/') ? nextPath : '/account';
      navigate(safeTarget, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!supabase) {
      setErrorMsg('Supabase is not configured yet.');
      return;
    }

    const cleanEmail = normalizeEmail(email);
    if (!isValidEmailFormat(cleanEmail)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/login?mode=update-password`
      });
      if (error) {
        setErrorMsg(error.message || 'Could not send reset email.');
        return;
      }
      setSuccessMsg('If an account exists for that email, a password reset link has been sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!supabase) {
      setErrorMsg('Supabase is not configured yet.');
      return;
    }

    if (newPassword.length < 10) {
      setErrorMsg('New password must be at least 10 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setErrorMsg(error.message || 'Unable to update password.');
        return;
      }
      setRecoveryMode(false);
      setSuccessMsg('Your password has been updated.');
      setTimeout(() => navigate('/account', { replace: true }), 900);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalFrame
      title={isUpdatePasswordView ? 'Reset Password' : mode === 'forgot' ? 'Recover Access' : 'Team Sign In'}
      subtitle={
        isUpdatePasswordView
          ? 'Choose a new password for your Veritas MUN team account.'
          : mode === 'forgot'
            ? 'Enter your roster email to receive a password reset link.'
            : 'Access your secretariat or organizing team portal.'
      }
    >
      <div className="border border-[#EDE6D6]/20 bg-[#EDE6D6] p-6 sm:p-8 text-[#1A1217] shadow-2xl">
        {!isSupabaseConfigured ? (
          <div className="mb-6 border border-[#7C1E21]/40 bg-[#FAF6EE] p-4 text-sm text-[#7C1E21]">
            <p className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
              Backend Configuration Needed
            </p>
            <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base">
              Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> in your environment to enable sign-in.
            </p>
          </div>
        ) : null}

        {errorMsg ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 border border-[#7C1E21]/40 bg-[#FBECEC] px-4 py-3 text-[#6E171B]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="font-['Cormorant_Garamond',Georgia,serif] text-base font-medium leading-snug">
              {errorMsg}
            </p>
          </div>
        ) : null}

        {successMsg ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-2.5 border border-[#2F6B34]/40 bg-[#EAF4EC] px-4 py-3 text-[#1F4A25]"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="font-['Cormorant_Garamond',Georgia,serif] text-base font-medium leading-snug">
              {successMsg}
            </p>
          </div>
        ) : null}

        {isUpdatePasswordView ? (
          <form onSubmit={handleUpdatePasswordSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="new-password"
                className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
              >
                New Password (min 10 characters)
              </label>
              <input
                id="new-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3.5 py-2 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217] focus:border-[#2F6B34] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-new-password"
                className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={e => setConfirmNewPassword(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3.5 py-2 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217] focus:border-[#2F6B34] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] bg-[#2F6B34] px-6 py-3 font-['Cinzel',serif] text-xs font-semibold tracking-[0.12em] uppercase text-[#EDE6D6] transition hover:bg-[#1F4A25] focus-visible:outline-2 focus-visible:outline-[#1A1217] disabled:opacity-60"
            >
              {submitting ? 'Updating...' : 'Save New Password'}
            </button>
          </form>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgotSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="forgot-email"
                className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
              >
                Roster Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/55" aria-hidden="true" />
                <input
                  id="forgot-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.edu"
                  className="w-full min-h-[44px] border border-[#1A1217]/25 bg-[#FAF6EE] pl-10 pr-3.5 py-2 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217] placeholder:text-[#1A1217]/40 focus:border-[#2F6B34] focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] bg-[#2F6B34] px-6 py-3 font-['Cinzel',serif] text-xs font-semibold tracking-[0.12em] uppercase text-[#EDE6D6] transition hover:bg-[#1F4A25] focus-visible:outline-2 focus-visible:outline-[#1A1217] disabled:opacity-60"
            >
              {submitting ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="min-h-[40px] font-['Cormorant_Garamond',Georgia,serif] text-base font-semibold underline underline-offset-4 text-[#1A1217]/80 hover:text-[#2F6B34]"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
              >
                Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/55" aria-hidden="true" />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.edu"
                  className="w-full min-h-[44px] border border-[#1A1217]/25 bg-[#FAF6EE] pl-10 pr-3.5 py-2 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217] placeholder:text-[#1A1217]/40 focus:border-[#2F6B34] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="login-password"
                  className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="font-['Cormorant_Garamond',Georgia,serif] text-base italic text-[#2F6B34] underline underline-offset-4 hover:text-[#1F4A25]"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/55" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full min-h-[44px] border border-[#1A1217]/25 bg-[#FAF6EE] pl-10 pr-11 py-2 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217] focus:border-[#2F6B34] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[#1A1217]/65 hover:text-[#1A1217]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] bg-[#2F6B34] px-6 py-3 font-['Cinzel',serif] text-xs font-semibold tracking-[0.12em] uppercase text-[#EDE6D6] transition hover:bg-[#1F4A25] focus-visible:outline-2 focus-visible:outline-[#1A1217] disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="border-t border-[#1A1217]/15 pt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/80">
                On the team roster?
              </span>
              <RouterLink
                to="/signup"
                className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#2F6B34] underline underline-offset-4 hover:text-[#1F4A25]"
              >
                Activate your account
              </RouterLink>
            </div>
          </form>
        )}
      </div>
    </PortalFrame>
  );
};
