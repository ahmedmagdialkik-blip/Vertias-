import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interpretEligibilityCheck,
  mapAuthErrorMessage,
  normalizeAuthPath,
  parseAuthUrlCallback,
  resolveInitialAuthMode,
  resolvePortalGate,
  resolveSignupOutcome,
  shouldRedirectRootAuthCallback,
  validateAuthSubmission
} from './portalAuthLogic';

test('normalizeAuthPath & resolveInitialAuthMode map /signup, /login, and recovery accurately', () => {
  assert.equal(normalizeAuthPath('/signup/'), '/signup');
  assert.equal(resolveInitialAuthMode('/signup', false), 'up');
  assert.equal(resolveInitialAuthMode('/signup/', false), 'up');
  assert.equal(resolveInitialAuthMode('/login', false), 'in');
  assert.equal(resolveInitialAuthMode('/account', false), 'in');
  assert.equal(resolveInitialAuthMode('/signup', true), 'reset');
});

test('shouldRedirectRootAuthCallback catches Supabase confirmation/recovery callbacks on /', () => {
  assert.equal(shouldRedirectRootAuthCallback('/', '', '#access_token=abc&type=signup'), true);
  assert.equal(shouldRedirectRootAuthCallback('/', '?code=123', ''), true);
  assert.equal(shouldRedirectRootAuthCallback('/', '?token_hash=th&type=recovery', ''), true);
  assert.equal(shouldRedirectRootAuthCallback('/', '', '#error=access_denied&error_code=otp_expired'), true);
  assert.equal(shouldRedirectRootAuthCallback('/', '', ''), false);
  assert.equal(shouldRedirectRootAuthCallback('/login', '', '#access_token=abc'), false);
});

test('parseAuthUrlCallback parses code, token_hash, recovery, and expired link errors', () => {
  const errCb = parseAuthUrlCallback('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  assert.equal(errCb.hasCallback, true);
  assert.ok(errCb.errorMessage?.includes('expired'));

  const pkceCb = parseAuthUrlCallback('?code=abc-123', '');
  assert.equal(pkceCb.hasCallback, true);
  assert.equal(pkceCb.code, 'abc-123');

  const otpCb = parseAuthUrlCallback('?token_hash=hash123&type=recovery', '');
  assert.equal(otpCb.hasCallback, true);
  assert.equal(otpCb.tokenHash, 'hash123');
  assert.equal(otpCb.otpType, 'recovery');
  assert.equal(otpCb.isRecovery, true);
});

test('validateAuthSubmission validates email, password min length, and confirmation match', () => {
  assert.equal(validateAuthSubmission('up', 'bad', 'password123', 'password123'), 'Enter a valid email address.');
  assert.equal(validateAuthSubmission('up', 'user@example.edu', '12345', '12345'), 'Password must be at least 6 characters long.');
  assert.equal(validateAuthSubmission('up', 'user@example.edu', '123456', '654321'), 'The passwords do not match.');
  assert.equal(validateAuthSubmission('up', 'user@example.edu', '123456', '123456'), null);
  assert.equal(validateAuthSubmission('in', 'user@example.edu', '1234', ''), null);
  assert.equal(validateAuthSubmission('reset', '', '123456', '123456'), null);
});

test('resolveSignupOutcome distinguishes email confirmation vs obfuscated duplicate vs roster error', () => {
  const confirm = resolveSignupOutcome({
    data: { session: null, user: { identities: [{ id: '1' }] } },
    error: null
  });
  assert.equal(confirm.status, 'confirm_email');
  assert.equal(confirm.canResend, true);

  const dup = resolveSignupOutcome({
    data: { session: null, user: { identities: [] } },
    error: null
  });
  assert.equal(dup.status, 'already_registered');
  assert.equal(dup.canResend, false);

  const rosterErr = resolveSignupOutcome({
    data: null,
    error: { message: 'Database error saving new user' }
  });
  assert.equal(rosterErr.status, 'error');
  assert.ok(rosterErr.message.includes("isn't on the team list"));

  const weakPw = resolveSignupOutcome({
    data: null,
    error: { code: 'weak_password', message: 'Password should be at least 8 characters.' }
  });
  assert.equal(weakPw.status, 'error');
  assert.equal(weakPw.message, 'Password should be at least 8 characters.');
});

test('mapAuthErrorMessage flags email_not_confirmed with resend support', () => {
  const unconfirmed = mapAuthErrorMessage('in', { code: 'email_not_confirmed', message: 'Email not confirmed' });
  assert.equal(unconfirmed.showResend, true);
  assert.ok(unconfirmed.message.includes('confirm your email'));

  const badCreds = mapAuthErrorMessage('in', { code: 'invalid_credentials', message: 'Invalid login credentials' });
  assert.equal(badCreds.showResend, false);
  assert.ok(badCreds.message.includes('Create account'));
});

test('resolvePortalGate handles errors, missing profiles, inactive accounts, and role routes cleanly', () => {
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: 'permission denied',
      profile: null,
      pathname: '/account'
    }),
    'profile_error'
  );
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: null,
      profile: null,
      pathname: '/account'
    }),
    'missing_profile'
  );
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: null,
      profile: { role: 'member', active: false },
      pathname: '/account'
    }),
    'waiting_approval'
  );
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: null,
      profile: { role: 'member', active: true },
      pathname: '/admin'
    }),
    'access_denied'
  );
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: null,
      profile: { role: 'head', active: true },
      pathname: '/admin'
    }),
    'admin'
  );
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: null,
      profile: { role: 'advisor', active: true },
      pathname: '/admin'
    }),
    'access_denied'
  );
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: null,
      profile: { role: 'advisor', active: true },
      pathname: '/account'
    }),
    'account'
  );
  assert.equal(
    resolvePortalGate({
      sessionLoading: false,
      hasSession: true,
      isRecovery: false,
      profileLoading: false,
      profileError: null,
      profile: { role: 'admin', active: true },
      pathname: '/account'
    }),
    'account'
  );
});

test('interpretEligibilityCheck handles authorized, inactive, unauthorized, and missing-RPC fallback', () => {
  assert.equal(interpretEligibilityCheck({ eligible: true, reason: 'ok' }, null).status, 'eligible');
  const blocked = interpretEligibilityCheck({ eligible: false, reason: 'not_found' }, null);
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.message.includes('approved Veritas MUN roster'));

  const inactive = interpretEligibilityCheck({ eligible: false, reason: 'inactive' }, null);
  assert.equal(inactive.status, 'blocked');
  assert.ok(inactive.message.includes('deactivated'));

  const rpcMissing = interpretEligibilityCheck(null, { code: 'PGRST202', message: 'Could not find the function' });
  assert.equal(rpcMissing.status, 'rpc_unavailable');

  const inactiveSignupErr = mapAuthErrorMessage('up', { message: 'Your roster entry is currently inactive.' });
  assert.ok(inactiveSignupErr.message.includes('deactivated'));
});

