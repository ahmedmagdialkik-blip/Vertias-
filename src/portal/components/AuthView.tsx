import React, { useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { sb } from '../supabaseClient';

interface AuthViewProps {
  recovery: boolean;
  initialMode?: 'in' | 'up' | 'forgot';
}

export const AuthView: React.FC<AuthViewProps> = ({ recovery, initialMode = 'in' }) => {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot' | 'reset'>(recovery ? 'reset' : initialMode);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setIsErr(false);
    const em = email.trim().toLowerCase();

    if ((mode === 'up' || mode === 'reset') && pw.length < 10) {
      setIsErr(true);
      setMsg('Your password must be at least 10 characters.');
      return;
    }
    if ((mode === 'up' || mode === 'reset') && pw !== pw2) {
      setIsErr(true);
      setMsg('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (error) {
          setIsErr(true);
          setMsg(
            /confirm/i.test(error.message)
              ? 'Please confirm your email first. Check your inbox for the confirmation message.'
              : 'Incorrect email or password.'
          );
        }
      } else if (mode === 'up') {
        const { data, error } = await sb.auth.signUp({
          email: em,
          password: pw,
          options: { emailRedirectTo: `${window.location.origin}/login` }
        });
        if (error) {
          setIsErr(true);
          setMsg(
            /database error|not on the team/i.test(error.message)
              ? "This email isn't on the team roster. Use the email listed on the roster or ask an administrator to add it."
              : error.status === 429
                ? 'Too many attempts. Please try again in a few minutes.'
                : error.message
          );
        } else if (!data.session) {
          setIsErr(false);
          setMsg('Account created. Check your inbox once to confirm your email, then sign in.');
        }
      } else if (mode === 'forgot') {
        await sb.auth.resetPasswordForEmail(em, { redirectTo: `${window.location.origin}/login` });
        setIsErr(false);
        setMsg('If that email is registered, a password reset link has been sent.');
      } else {
        const { error } = await sb.auth.updateUser({ password: pw });
        if (error) {
          setIsErr(true);
          setMsg(error.message);
        } else {
          setIsErr(false);
          setMsg('Password updated. Redirecting...');
          setTimeout(() => {
            window.location.href = '/account';
          }, 800);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<'in' | 'up' | 'forgot' | 'reset', string> = {
    in: 'Sign In to Team Portal',
    up: 'Create Team Account',
    forgot: 'Reset Password',
    reset: 'Choose New Password'
  };

  return (
    <div className="min-h-screen bg-[#1A1217] flex flex-col justify-between px-4 py-8 text-[#EDE6D6]">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <a href="/" className="inline-flex items-center gap-2 text-xs font-medium text-[#BAB1A0] hover:text-[#EDE6D6]">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to Veritas MUN</span>
        </a>
        <a href="/apply" className="text-xs font-medium text-[#4F9A57] hover:underline">
          Security Application
        </a>
      </div>

      <main className="mx-auto my-8 w-full max-w-md rounded-[2px] border border-[#BAB1A0]/25 bg-[#FAF6EE] p-7 sm:p-8 text-[#1A1217] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#1A1217]/12 pb-5">
          <img
            src="/logo.png"
            alt="Veritas MUN"
            className="h-11 w-11 shrink-0 rounded-full object-cover border border-[#1A1217]/20"
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2F6B34]">
              Secretariat &amp; Staff Portal
            </p>
            <h1 className="font-display text-xl font-semibold text-[#1A1217]">{titles[mode]}</h1>
          </div>
        </div>

        {mode === 'up' && (
          <p className="mt-4 text-xs leading-relaxed text-[#1A1217]/75">
            Enter the email address listed on the Veritas MUN team roster. Your department and role are linked automatically upon verification.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode !== 'reset' && (
            <div>
              <label htmlFor="auth-email" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#1A1217]/80">
                Email Address
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@veritasmun.org"
                autoComplete="email"
                className="v-input"
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <label htmlFor="auth-pw" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#1A1217]/80">
                {mode === 'in' ? 'Password' : 'New Password (10+ characters)'}
              </label>
              <input
                id="auth-pw"
                type="password"
                required
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder={mode === 'in' ? 'Enter password' : 'Minimum 10 characters'}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                className="v-input"
              />
            </div>
          )}

          {(mode === 'up' || mode === 'reset') && (
            <div>
              <label htmlFor="auth-pw2" className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#1A1217]/80">
                Confirm Password
              </label>
              <input
                id="auth-pw2"
                type="password"
                required
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                placeholder="Re-enter password"
                autoComplete="new-password"
                className="v-input"
              />
            </div>
          )}

          <button type="submit" disabled={busy} className="v-btn v-btn-primary w-full">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{busy ? 'Please wait...' : titles[mode]}</span>
          </button>

          {msg && (
            <div
              role={isErr ? 'alert' : 'status'}
              className={`rounded-[2px] border px-3 py-2.5 text-xs font-medium ${
                isErr
                  ? 'border-[#8A2B2B]/35 bg-[#8A2B2B]/5 text-[#741F1F]'
                  : 'border-[#2F6B34]/35 bg-[#2F6B34]/10 text-[#1E4D23]'
              }`}
            >
              {msg}
            </div>
          )}
        </form>

        {mode !== 'reset' && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#1A1217]/12 pt-4 text-xs">
            {mode !== 'in' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('in');
                  setMsg('');
                  setIsErr(false);
                }}
                className="font-semibold text-[#2F6B34] hover:underline"
              >
                Sign in instead
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode('up');
                  setMsg('');
                  setIsErr(false);
                }}
                className="font-semibold text-[#2F6B34] hover:underline"
              >
                Create team account
              </button>
            )}

            {mode === 'in' && (
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setMsg('');
                  setIsErr(false);
                }}
                className="text-[#1A1217]/70 hover:text-[#1A1217] hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-[#BAB1A0]/70">
        Veritas MUN Administration · Restricted Access
      </footer>
    </div>
  );
};
