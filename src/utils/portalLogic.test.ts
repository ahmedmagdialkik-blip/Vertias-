import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMemberViewAnnouncement,
  checkRateLimit,
  computeAdminAccess,
  computeOverviewMetrics,
  exportRosterToCsv,
  formatMemberWelcome,
  mergeSiteContentWithFallback,
  normalizeEmail,
  parseAndValidateRosterCsv,
  reorderList,
  resolveSignupErrorMessage,
  sanitizeImageUrl,
  validateSignupInput
} from './portalLogic.ts';

test('normalizeEmail & validateSignupInput enforce email format and min 10 char password', () => {
  assert.equal(normalizeEmail('  Alice@Example.EDU '), 'alice@example.edu');
  assert.equal(validateSignupInput('not-an-email', 'longpassword123'), 'Enter a valid email address.');
  assert.equal(validateSignupInput('user@example.edu', 'short123'), 'Password must be at least 10 characters long.');
  assert.equal(validateSignupInput('user@example.edu', 'tenchars10'), null);
});

test('formatMemberWelcome produces clean greeting with first name, position, and department', () => {
  assert.equal(
    formatMemberWelcome({ full_name: 'Jane Marie Doe', position: 'Head', department: 'Crisis' }),
    'Welcome, Jane (Head, Crisis)'
  );
  assert.equal(
    formatMemberWelcome({ full_name: 'Sam', position: 'Member', department: '' }),
    'Welcome, Sam (Member)'
  );
});

test('computeAdminAccess enforces fail-closed login and admin role checks', () => {
  assert.equal(computeAdminAccess(true, false, null), 'loading');
  assert.equal(computeAdminAccess(false, false, null), 'redirect_login');
  assert.equal(computeAdminAccess(false, true, { role: 'member', active: true }), 'access_denied');
  assert.equal(computeAdminAccess(false, true, { role: 'head', active: true }), 'access_denied');
  assert.equal(computeAdminAccess(false, true, { role: 'admin', active: false }), 'access_denied');
  assert.equal(computeAdminAccess(false, true, { role: 'admin', active: true }), 'allow');
});

test('checkRateLimit blocks after maxAttempts within window and reports retry countdown', () => {
  const now = 1_000_000;
  const attempts = [now - 5000, now - 4000, now - 3000, now - 2000, now - 1000];
  const blocked = checkRateLimit(attempts, now, 5, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remainingAttempts, 0);
  assert.ok(blocked.retryAfterSeconds >= 54 && blocked.retryAfterSeconds <= 56);

  const expired = checkRateLimit(attempts, now + 70_000, 5, 60_000);
  assert.equal(expired.allowed, true);
  assert.equal(expired.remainingAttempts, 5);
});

test('resolveSignupErrorMessage maps roster trigger error to exact friendly copy', () => {
  assert.equal(
    resolveSignupErrorMessage("Database error saving new user: This email isn't on the team list. Contact an admin."),
    "This email isn't on the team list. Contact an admin."
  );
  assert.equal(
    resolveSignupErrorMessage('User already registered'),
    'An account for this email already exists. Try signing in or resetting your password.'
  );
});

test('parseAndValidateRosterCsv validates required columns, duplicate emails, and existing roster collisions', () => {
  const csv = [
    'full_name,email,phone,department,position',
    'Jane Doe,jane@example.edu,555-0101,Logistics,Head',
    'Alex Smith,existing@example.edu,555-0102,Press,Member',
    'Dup Person,jane@example.edu,555-0103,Crisis,Member',
    ',bad-email,555-0104,Crisis,Member'
  ].join('\n');

  const result = parseAndValidateRosterCsv(csv, ['EXISTING@example.edu']);
  assert.equal(result.headerError, null);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].valid, true);
  assert.equal(result.rows[1].valid, false);
  assert.ok(result.rows[1].errors.includes('Already in roster'));
  assert.equal(result.rows[2].valid, false);
  assert.ok(result.rows[2].errors.includes('Duplicate email in CSV'));
  assert.equal(result.rows[3].valid, false);
  assert.ok(result.rows[3].errors.includes('Missing full_name'));
  assert.ok(result.rows[3].errors.includes('Invalid email format'));
});

test('exportRosterToCsv neutralizes spreadsheet formula injection', () => {
  const csv = exportRosterToCsv([
    {
      id: '1',
      full_name: '=CMD()',
      email: 'safe@example.edu',
      phone: '+555-0100',
      department: 'Crisis',
      position: 'Member',
      notes: 'Row, note',
      created_at: '2026-01-01T00:00:00Z'
    }
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[1], "'=CMD(),safe@example.edu,'+555-0100,Crisis,Member,\"Row, note\"");
});

test('computeOverviewMetrics accurately tallies signed-up vs pending roster members', () => {
  const roster = [
    { id: 'r1', full_name: 'A', email: 'a@example.com', phone: '', department: 'Crisis', position: 'Member', notes: '', created_at: '' },
    { id: 'r2', full_name: 'B', email: 'b@example.com', phone: '', department: 'Logistics', position: 'Head', notes: '', created_at: '' },
    { id: 'r3', full_name: 'C', email: 'c@example.com', phone: '', department: 'Press', position: 'Member', notes: '', created_at: '' }
  ];
  const profiles = [
    { id: 'u1', roster_id: 'r1', email: 'a@example.com', full_name: 'A', department: 'Crisis', position: 'Member', role: 'member' as const, active: true, created_at: '' },
    { id: 'u2', roster_id: 'r2', email: 'b@example.com', full_name: 'B', department: 'Logistics', position: 'Head', role: 'head' as const, active: false, created_at: '' }
  ];
  const stats = computeOverviewMetrics(roster, profiles);
  assert.deepEqual(stats, {
    totalRoster: 3,
    signedUpCount: 2,
    notSignedUpCount: 1,
    activeAccountsCount: 1
  });
});

test('mergeSiteContentWithFallback preserves defaults and applies valid DB overrides', () => {
  const merged = mergeSiteContentWithFallback([
    { key: 'hero', value: { title: 'VERITAS MUN', tagline: 'Updated truth', ctaLabel: 'Apply' } },
    { key: 'committees', value: { showTba: false, tbaSubtitle: 'Soon', items: [{ name: 'UNSC', details: 'Security Council' }] } }
  ]);
  assert.equal(merged.hero.tagline, 'Updated truth');
  assert.equal(merged.hero.ctaLabel, 'Apply');
  assert.equal(merged.committees.showTba, false);
  assert.equal(merged.committees.items.length, 1);
  assert.equal(merged.schedule.showTba, true);
});

test('canMemberViewAnnouncement matches audience rules accurately', () => {
  const member = { role: 'member' as const, department: 'Crisis', active: true };
  const head = { role: 'head' as const, department: 'Logistics', active: true };
  const inactive = { role: 'head' as const, department: 'Crisis', active: false };

  assert.equal(canMemberViewAnnouncement({ audience: 'all', target_department: null }, member), true);
  assert.equal(canMemberViewAnnouncement({ audience: 'heads', target_department: null }, member), false);
  assert.equal(canMemberViewAnnouncement({ audience: 'heads', target_department: null }, head), true);
  assert.equal(canMemberViewAnnouncement({ audience: 'department', target_department: 'crisis' }, member), true);
  assert.equal(canMemberViewAnnouncement({ audience: 'department', target_department: 'Crisis' }, head), false);
  assert.equal(canMemberViewAnnouncement({ audience: 'all', target_department: null }, inactive), false);
});

test('sanitizeImageUrl rejects javascript: URLs and permits safe relative/https paths', () => {
  assert.equal(sanitizeImageUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeImageUrl('/assets/photo.jpg'), '/assets/photo.jpg');
  assert.equal(sanitizeImageUrl('https://cdn.example.com/photo.webp'), 'https://cdn.example.com/photo.webp');
});

test('reorderList moves elements cleanly without mutating original array', () => {
  const orig = ['a', 'b', 'c'];
  assert.deepEqual(reorderList(orig, 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(orig, ['a', 'b', 'c']);
});
