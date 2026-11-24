import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { PortalFrame } from '../components/PortalFrame';
import { useAuth } from '../context/AuthContext';
import { navigate, RouterLink } from '../lib/router';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  checkRateLimit,
  normalizeEmail,
  pruneAttemptTimestamps,
  resolveSignupErrorMessage,
  validateSignupInput
} from '../utils/portalLogic';

const RATE_STORAGE_KEY = 'veritas_signup_attempts_v1';

function readStoredAttempts(): number[] {
  try {
    const raw = window.localStorage.getItem(RATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(n => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function writeStoredAttempts(timestamps: number[]): void {
  try {
    window.localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(timestamps));
  } catch {
    // Ignore storage quota errors
  }
}

export const SignupPage: React.FC = () => {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedNoticeEmail, setVerifiedNoticeEmail] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      navigate('/account', { replace: true });
    }
  }, [loading, user]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      const status = checkRateLimit(readStoredAttempts(), Date.now());
      setCooldownSeconds(status.allowed ? 0 : status.retryAfterSeconds);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validationError = validateSignupInput(email, password);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    const now = Date.now();
    const currentAttempts = pruneAttemptTimestamps(readStoredAttempts(), now);
    const rate = checkRateLimit(currentAttempts, now);
    if (!rate.allowed) {
      setCooldownSeconds(rate.retryAfterSeconds);
      setErrorMsg(`Too many sign-up attempts. Wait ${rate.retryAfterSeconds}s before trying again.`);
      return;
    }

    if (!supabase) {
      setErrorMsg('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
      return;
    }

    const nextAttempts = [...currentAttempts, now];
    writeStoredAttempts(nextAttempts);

    setSubmitting(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      if (error) {
        setErrorMsg(resolveSignupErrorMessage(error.message));
        return;
      }

      if (data.session) {
        navigate('/account', { replace: true });
        return;
      }

      setVerifiedNoticeEmail(cleanEmail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalFrame
      title="Team Sign Up"
      subtitle="Only emails registered on the Veritas MUN roster can activate an account."
    >
      <div className="border border-[#EDE6D6]/20 bg-[#EDE6D6] p-6 sm:p-8 text-[#1A1217] shadow-2xl">
        {!isSupabaseConfigured ? (
          <div className="mb-6 border border-[#7C1E21]/40 bg-[#FAF6EE] p-4 text-sm text-[#7C1E21]">
            <p className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
              Backend Configuration Needed
            </p>
            <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base">
              Set <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> to activate roster-verified sign-up.
            </p>
          </div>
        ) : null}

        {verifiedNoticeEmail ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 border border-[#2F6B34]/40 bg-[#EAF4EC] p-4 text-[#1F4A25]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-['Cinzel',serif] text-sm font-semibold tracking-wider uppercase">
                  Check Your Inbox
                </h2>
                <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-lg leading-relaxed">
                  We sent a verification link to <strong>{verifiedNoticeEmail}</strong>. Confirm your email address before signing in.
                </p>
              </div>
            </div>

            <RouterLink
              to="/login"
              className="inline-flex min-h-[44px] w-full items-center justify-center bg-[#2F6B34] px-6 py-3 font-['Cinzel',serif] text-xs font-semibold tracking-[0.12em] uppercase text-[#EDE6D6] no-underline hover:bg-[#1F4A25]"
            >
              Go to Sign In
            </RouterLink>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMsg ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 border border-[#7C1E21]/40 bg-[#FBECEC] px-4 py-3 text-[#6E171B]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p className="font-['Cormorant_Garamond',Georgia,serif] text-base font-medium leading-snug">
                  {errorMsg}
                </p>
              </div>
            ) : null}

            <div>
              <label
                htmlFor="signup-email"
                className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
              >
                Roster Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/55" aria-hidden="true" />
                <input
                  id="signup-email"
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
                  htmlFor="signup-password"
                  className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
                >
                  Password
                </label>
                <span className="font-['Cormorant_Garamond',Georgia,serif] text-sm tabular-nums text-[#1A1217]/75">
                  {password.length}/10+ characters
                </span>
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/55" aria-hidden="true" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={10}
                  autoComplete="new-password"
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

            <div>
              <label
                htmlFor="signup-confirm"
                className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#1A1217]"
              >
                Confirm Password
              </label>
              <input
                id="signup-confirm"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={10}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3.5 py-2 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217] focus:border-[#2F6B34] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || cooldownSeconds > 0}
              className="w-full min-h-[46px] bg-[#2F6B34] px-6 py-3 font-['Cinzel',serif] text-xs font-semibold tracking-[0.12em] uppercase text-[#EDE6D6] transition hover:bg-[#1F4A25] focus-visible:outline-2 focus-visible:outline-[#1A1217] disabled:opacity-60"
            >
              {cooldownSeconds > 0
                ? `Try again in ${cooldownSeconds}s`
                : submitting
                  ? 'Creating Account...'
                  : 'Create Team Account'}
            </button>

            <div className="border-t border-[#1A1217]/15 pt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/80">
                Already verified?
              </span>
              <RouterLink
                to="/login"
                className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase text-[#2F6B34] underline underline-offset-4 hover:text-[#1F4A25]"
              >
                Sign in
              </RouterLink>
            </div>
          </form>
        )}
      </div>
    </PortalFrame>
  );
};
