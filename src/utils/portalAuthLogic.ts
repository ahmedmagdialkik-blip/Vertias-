export type AuthMode = 'in' | 'up' | 'forgot' | 'reset';

export interface AuthUrlCallback {
  hasCallback: boolean;
  code: string | null;
  tokenHash: string | null;
  otpType: string | null;
  isRecovery: boolean;
  errorMessage: string | null;
}

export interface SignupOutcome {
  status: 'signed_in' | 'confirm_email' | 'already_registered' | 'error';
  message: string;
  canResend: boolean;
}

export type PortalGateState =
  | 'loading_session'
  | 'auth'
  | 'loading_profile'
  | 'profile_error'
  | 'missing_profile'
  | 'waiting_approval'
  | 'access_denied'
  | 'admin'
  | 'account';

export interface MinimalProfile {
  role?: string | null;
  active?: boolean | null;
}

export const MIN_AUTH_PASSWORD_LENGTH = 6;

export function normalizeAuthPath(pathname: string): string {
  const cleaned = (pathname || '/').replace(/\/+$/, '');
  return cleaned || '/';
}

export function resolveInitialAuthMode(pathname: string, isRecovery: boolean): AuthMode {
  if (isRecovery) return 'reset';
  const path = normalizeAuthPath(pathname);
  return path === '/signup' ? 'up' : 'in';
}

export function shouldRedirectRootAuthCallback(pathname: string, search: string, hash: string): boolean {
  if (normalizeAuthPath(pathname) !== '/') return false;
  const combined = `${search || ''}&${hash || ''}`;
  return /(access_token=|refresh_token=|token_hash=|code=|error_description=|error=|type=(signup|recovery|magiclink|email_change|invite))/.test(
    combined
  );
}

function cleanParamMessage(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/\+/g, ' ').trim() || null;
}

export function parseAuthUrlCallback(search: string, hash: string): AuthUrlCallback {
  const sp = new URLSearchParams((search || '').replace(/^\?/, ''));
  const hp = new URLSearchParams((hash || '').replace(/^#/, ''));

  const errorCode = hp.get('error_code') || sp.get('error_code');
  const error = hp.get('error') || sp.get('error');
  const rawDesc = cleanParamMessage(hp.get('error_description') || sp.get('error_description'));
  const code = sp.get('code');
  const tokenHash = sp.get('token_hash') || hp.get('token_hash');
  const otpType = sp.get('type') || hp.get('type');
  const hasAccessToken = hp.has('access_token');
  const isRecovery = otpType === 'recovery';

  let errorMessage: string | null = null;
  if (error || errorCode || rawDesc) {
    if (errorCode === 'otp_expired' || /expired|invalid/i.test(rawDesc || '')) {
      errorMessage =
        'This confirmation or reset link is invalid or has expired. Request a new link below, or sign in if you already confirmed your email.';
    } else {
      errorMessage = rawDesc || 'Authentication link could not be verified. Please try signing in or requesting a new link.';
    }
  }

  return {
    hasCallback: Boolean(code || tokenHash || hasAccessToken || errorMessage),
    code,
    tokenHash,
    otpType,
    isRecovery,
    errorMessage
  };
}

export function validateAuthSubmission(
  mode: AuthMode,
  email: string,
  password: string,
  confirmPassword: string
): string | null {
  const normalized = (email || '').trim().toLowerCase();
  if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    return 'Enter a valid email address.';
  }
  if (mode === 'in' && !password) {
    return 'Enter your password.';
  }
  if (mode === 'up' || mode === 'reset') {
    if (!password || password.length < MIN_AUTH_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_AUTH_PASSWORD_LENGTH} characters long.`;
    }
    if (password !== confirmPassword) {
      return 'The passwords do not match.';
    }
  }
  return null;
}

export function mapAuthErrorMessage(
  mode: AuthMode,
  error: { message?: string; code?: string; status?: number } | null | undefined
): { message: string; showResend: boolean } {
  const raw = (error?.message || '').trim();
  const code = (error?.code || '').toLowerCase();
  const status = error?.status;

  if (status === 429 || code.includes('rate_limit') || /rate limit|too many|security purposes/i.test(raw)) {
    return {
      message: 'Too many requests or emails sent recently. Please wait a few minutes and try again.',
      showResend: false
    };
  }

  if (mode === 'in') {
    if (code === 'email_not_confirmed' || /confirm/i.test(raw)) {
      return {
        message: 'Please confirm your email first. Check your inbox and spam folder, or resend the confirmation email below.',
        showResend: true
      };
    }
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(raw)) {
      return {
        message: 'Wrong email or password. Need an account? Use Create account, or use Forgot password?',
        showResend: false
      };
    }
    return {
      message: raw || 'Unable to sign in right now. Please try again.',
      showResend: false
    };
  }

  if (mode === 'up') {
    if (/inactive|deactivated/i.test(raw)) {
      return {
        message: 'Your roster entry is currently deactivated. Contact an admin.',
        showResend: false
      };
    }
    if (/database error|not on the team|isn't on the team/i.test(raw)) {
      return {
        message: "This email isn't on the team list. Use the exact email you gave on the team form, or ask an admin to add it.",
        showResend: false
      };
    }
    if (code === 'user_already_exists' || /already registered|already exists/i.test(raw)) {
      return {
        message: 'This email already has an account. Sign in, or use Forgot password?',
        showResend: false
      };
    }
    if (code === 'weak_password' || /password/i.test(raw)) {
      return {
        message: raw || 'Password does not meet the minimum security requirements.',
        showResend: false
      };
    }
    if (code === 'signup_disabled' || /signups not allowed/i.test(raw)) {
      return {
        message: 'New account sign-ups are currently disabled.',
        showResend: false
      };
    }
    return {
      message: raw || 'Unable to create your account right now.',
      showResend: false
    };
  }

  return {
    message: raw || 'Request failed. Please try again.',
    showResend: false
  };
}

export function resolveSignupOutcome(result: {
  data?: {
    session?: unknown | null;
    user?: { identities?: unknown[] | null } | null;
  } | null;
  error?: { message?: string; code?: string; status?: number } | null;
}): SignupOutcome {
  if (result.error) {
    const mapped = mapAuthErrorMessage('up', result.error);
    return {
      status: 'error',
      message: mapped.message,
      canResend: false
    };
  }

  if (result.data?.session) {
    return {
      status: 'signed_in',
      message: 'Account created. Signing you in...',
      canResend: false
    };
  }

  // Supabase returns an obfuscated user with empty identities[] when an email is already confirmed
  const identities = result.data?.user?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return {
      status: 'already_registered',
      message: 'This email already has an account. Sign in, or use Forgot password?',
      canResend: false
    };
  }

  return {
    status: 'confirm_email',
    message: 'Account created! Check your email inbox (and spam folder) and click the confirmation link before signing in.',
    canResend: true
  };
}

export function resolvePortalGate(opts: {
  sessionLoading: boolean;
  hasSession: boolean;
  isRecovery: boolean;
  profileLoading: boolean;
  profileError: string | null;
  profile: MinimalProfile | null;
  pathname: string;
}): PortalGateState {
  if (opts.sessionLoading) return 'loading_session';
  if (!opts.hasSession || opts.isRecovery) return 'auth';
  if (opts.profileLoading) return 'loading_profile';
  if (opts.profileError) return 'profile_error';
  if (!opts.profile) return 'missing_profile';
  if (!opts.profile.active) return 'waiting_approval';

  const path = normalizeAuthPath(opts.pathname);
  if (path === '/admin') {
    const canAdmin = opts.profile.role === 'admin' || opts.profile.role === 'head';
    return canAdmin ? 'admin' : 'access_denied';
  }
  return 'account';
}

export interface RosterEligibilityOutcome {
  status: 'eligible' | 'blocked' | 'rpc_unavailable';
  message: string;
}

export function interpretEligibilityCheck(
  data: { eligible?: boolean; reason?: string } | null | undefined,
  error: { message?: string; code?: string; status?: number } | null | undefined
): RosterEligibilityOutcome {
  if (error) {
    const code = (error.code || '').toUpperCase();
    const msg = (error.message || '').toLowerCase();
    if (
      code === 'PGRST202' ||
      code === '42883' ||
      error.status === 404 ||
      msg.includes('could not find the function') ||
      msg.includes('does not exist')
    ) {
      return { status: 'rpc_unavailable', message: '' };
    }
    return { status: 'rpc_unavailable', message: '' };
  }

  if (!data || typeof data.eligible !== 'boolean') {
    return { status: 'rpc_unavailable', message: '' };
  }

  if (data.eligible) {
    return {
      status: 'eligible',
      message: 'Approved roster email verified. Choose a password to complete registration.'
    };
  }

  if (data.reason === 'inactive') {
    return {
      status: 'blocked',
      message: 'Your roster entry is currently deactivated. Contact an administrator.'
    };
  }

  if (data.reason === 'invalid_email') {
    return {
      status: 'blocked',
      message: 'Enter a valid email address.'
    };
  }

  return {
    status: 'blocked',
    message: "This email isn't on the approved Veritas MUN roster. Contact an administrator."
  };
}

