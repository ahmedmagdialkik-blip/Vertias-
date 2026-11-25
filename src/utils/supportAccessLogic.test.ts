import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSupportDuration,
  filterRegisteredUsersForSupport,
  formatRemainingTime,
  formatSupportAuditSummary,
  getTargetAvailableDashboardTabs,
  isAhmedCoHeadProfile,
  isSupportSessionActive,
  stripSensitiveAccountFields,
  validateSupportAccessStart,
  type SupportAccessSession,
  type SupportTargetProfile
} from './supportAccessLogic';

test('stripSensitiveAccountFields removes any credential keys without mutating visible profile fields', () => {
  const sanitized = stripSensitiveAccountFields({
    id: 'u1',
    full_name: 'Mira Haddad',
    email: 'mira@veritas.edu',
    role: 'head',
    password: 'secret-value',
    encrypted_password: 'hash-value',
    recovery_token: 'tok-123'
  });

  assert.equal(sanitized.id, 'u1');
  assert.equal(sanitized.full_name, 'Mira Haddad');
  assert.equal('password' in sanitized, false);
  assert.equal('encrypted_password' in sanitized, false);
  assert.equal('recovery_token' in sanitized, false);
});

test('isAhmedCoHeadProfile grants UI check only to active admin Ahmed Magdi Co-Head of IT', () => {
  assert.equal(
    isAhmedCoHeadProfile({
      id: 'ahmed-1',
      full_name: 'Ahmed Magdi',
      email: 'ahmed@veritas.edu',
      department: 'IT',
      position: 'Co-Head of IT',
      role: 'admin',
      active: true
    }),
    true
  );

  // Other admins (Secretary-General, etc.) must NOT qualify
  assert.equal(
    isAhmedCoHeadProfile({
      id: 'laila-1',
      full_name: 'Laila Mohammad',
      email: 'laila@veritas.edu',
      department: 'Secretaries',
      position: 'Secretary-General',
      role: 'admin',
      active: true
    }),
    false
  );

  // Unverified email or non-admin role must NOT qualify
  assert.equal(
    isAhmedCoHeadProfile(
      {
        id: 'ahmed-1',
        full_name: 'Ahmed Magdi',
        department: 'IT',
        position: 'Co-Head of IT',
        role: 'admin',
        active: true
      },
      false
    ),
    false
  );
});

test('validateSupportAccessStart & clampSupportDuration enforce non-self target, reason >= 5 chars, and 5..30 min limits', () => {
  assert.equal(
    validateSupportAccessStart({
      operatorId: 'ahmed-1',
      targetId: 'ahmed-1',
      reason: 'Debugging',
      durationMinutes: 15
    }),
    'Select a different registered user account.'
  );

  assert.equal(
    validateSupportAccessStart({
      operatorId: 'ahmed-1',
      targetId: 'user-2',
      reason: 'hi',
      durationMinutes: 15
    }),
    'Enter a brief support reason (at least 5 characters).'
  );

  assert.equal(
    validateSupportAccessStart({
      operatorId: 'ahmed-1',
      targetId: 'user-2',
      reason: 'Checking volunteer announcements',
      durationMinutes: 15
    }),
    null
  );

  assert.equal(clampSupportDuration(2), 5);
  assert.equal(clampSupportDuration(60), 30);
  assert.equal(clampSupportDuration(20), 20);
});

test('filterRegisteredUsersForSupport excludes operator self and filters by search and role', () => {
  const users: SupportTargetProfile[] = [
    { id: 'ahmed-1', email: 'ahmed@v.edu', full_name: 'Ahmed Magdi', department: 'IT', position: 'Co-Head of IT', role: 'admin', active: true },
    { id: 'u2', email: 'zaid@v.edu', full_name: 'Zaid Al-Harbi', department: 'Security', position: 'Head of Security', role: 'head', active: true },
    { id: 'u3', email: 'sara@v.edu', full_name: 'Sara Ali', department: 'Media', position: 'Member', role: 'member', active: false }
  ];

  const allOthers = filterRegisteredUsersForSupport(users, 'ahmed-1', '', 'all');
  assert.deepEqual(allOthers.map(u => u.id), ['u2', 'u3']);

  const headSearch = filterRegisteredUsersForSupport(users, 'ahmed-1', 'security', 'head');
  assert.deepEqual(headSearch.map(u => u.id), ['u2']);
});

test('support session TTL, countdown formatting, target dashboard routing, and audit text work accurately', () => {
  const now = Date.parse('2026-11-24T18:00:00Z');
  const session: SupportAccessSession = {
    id: 'sess-1',
    operator_user_id: 'ahmed-1',
    operator_email: 'ahmed@v.edu',
    target_user_id: 'u2',
    target_email: 'zaid@v.edu',
    target_full_name: 'Zaid Al-Harbi',
    target_role: 'head',
    target_department: 'Security',
    reason: 'Checking application visibility',
    status: 'active',
    started_at: '2026-11-24T17:55:00Z',
    expires_at: '2026-11-24T18:12:35Z'
  };

  assert.equal(isSupportSessionActive(session, now), true);
  assert.equal(formatRemainingTime(session.expires_at, now), '12:35');
  assert.equal(isSupportSessionActive(session, Date.parse('2026-11-24T18:13:00Z')), false);

  assert.deepEqual(
    getTargetAvailableDashboardTabs({ id: 'u2', email: 'z@v.edu', full_name: 'Zaid', department: 'Security', position: 'Head', role: 'head', active: true }),
    ['applications', 'account']
  );
  assert.deepEqual(
    getTargetAvailableDashboardTabs({ id: 'u3', email: 's@v.edu', full_name: 'Sara', department: 'Media', position: 'Member', role: 'member', active: true }),
    ['account']
  );
  assert.deepEqual(
    getTargetAvailableDashboardTabs({ id: 'u4', email: 'w@v.edu', full_name: 'Wait', department: 'Media', position: 'Member', role: 'member', active: false }),
    ['waiting_approval']
  );

  assert.match(
    formatSupportAuditSummary('support_access_started', {
      target_full_name: 'Zaid Al-Harbi',
      target_role: 'head',
      reason: 'Verify Security queue'
    }),
    /Zaid Al-Harbi.*head.*Verify Security queue/
  );
});
