import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGmailComposeUrl,
  canIssueApplicantInvite,
  extractInviteTokenFromUrl,
  filterQrPasses,
  getAuthorizedManagementTabs,
  inferInviteRoleAndRank,
  interpolateEmailTemplate,
  isQrScannerAuthorizedProfile,
  normalizeQrTokenInput,
  summarizeQrAttendance,
  validateApplicationOverrideReason,
  wouldCreateHierarchyCycle
} from './managementLogic';

test('getAuthorizedManagementTabs enforces strict portal role and department isolation', () => {
  const adminTabs = getAuthorizedManagementTabs(
    { id: 'u1', role: 'admin', department: 'IT', active: true },
    { supportAuthorized: true }
  );
  assert.ok(adminTabs.some(t => t.id === 'overview'));
  assert.ok(adminTabs.some(t => t.id === 'qr_scanner'));
  assert.ok(adminTabs.some(t => t.id === 'support_access'));
  assert.ok(adminTabs.some(t => t.id === 'email_center'));

  // Non-support admin does not see support_access
  const regularAdminTabs = getAuthorizedManagementTabs(
    { id: 'u2', role: 'admin', department: 'Secretaries', active: true },
    { supportAuthorized: false }
  );
  assert.equal(regularAdminTabs.some(t => t.id === 'support_access'), false);

  // Media Head does NOT see QR scanner or Security/Volunteer applications (matches UI/backend alignment)
  const mediaHeadTabs = getAuthorizedManagementTabs({
    id: 'u3',
    role: 'head',
    department: 'Media',
    active: true
  });
  assert.equal(isQrScannerAuthorizedProfile({ id: 'u3', role: 'head', department: 'Media', active: true }), false);
  assert.equal(mediaHeadTabs.some(t => t.id === 'qr_scanner'), false);
  assert.equal(mediaHeadTabs.some(t => t.id === 'applications'), false);
  assert.equal(mediaHeadTabs.some(t => t.id === 'operations'), true);
  assert.equal(mediaHeadTabs.some(t => t.id === 'my_pass'), true);

  // Security Head DOES see applications and QR scanner
  const secHeadTabs = getAuthorizedManagementTabs({
    id: 'u4',
    role: 'head',
    department: 'Security',
    active: true
  });
  assert.equal(secHeadTabs.some(t => t.id === 'applications'), true);
  assert.equal(secHeadTabs.some(t => t.id === 'qr_scanner'), true);

  // HR Head sees HR & Onboarding + Email Center
  const hrHeadTabs = getAuthorizedManagementTabs({
    id: 'u5',
    role: 'head',
    department: 'HR',
    active: true
  });
  assert.equal(hrHeadTabs.some(t => t.id === 'hr_invites'), true);
  assert.equal(hrHeadTabs.some(t => t.id === 'email_center'), true);

  // Inactive user sees nothing
  assert.equal(getAuthorizedManagementTabs({ id: 'u6', role: 'admin', active: false }).length, 0);
});

test('invite helpers extract hash/query tokens, infer roles cleanly, and gate on accepted status', () => {
  assert.equal(extractInviteTokenFromUrl('', '#token=vm_inv_abc123'), 'vm_inv_abc123');
  assert.equal(extractInviteTokenFromUrl('?token=vm_eb_xyz', ''), 'vm_eb_xyz');

  assert.deepEqual(inferInviteRoleAndRank('head', 'Co-Head of Security'), {
    role: 'head',
    ebRank: 'co_head'
  });
  assert.deepEqual(inferInviteRoleAndRank('member', 'Volunteer'), {
    role: 'member',
    ebRank: 'member'
  });

  assert.equal(canIssueApplicantInvite({ status: 'pending', email: 'a@b.com' }).ok, false);
  assert.equal(canIssueApplicantInvite({ status: 'accepted', email: 'a@b.com' }).ok, true);
});

test('email interpolation and Gmail compose URL preserve clean parameters', () => {
  const rendered = interpolateEmailTemplate('Hello {{full_name}}, welcome to {{department}}.', {
    full_name: 'Nour Haddad',
    department: 'Volunteers'
  });
  assert.equal(rendered, 'Hello Nour Haddad, welcome to Volunteers.');

  const gmailUrl = buildGmailComposeUrl({
    to: 'nour@example.edu',
    subject: 'Veritas MUN Decision',
    body: rendered
  });
  const parsed = new URL(gmailUrl);
  assert.equal(parsed.hostname, 'mail.google.com');
  assert.equal(parsed.searchParams.get('to'), 'nour@example.edu');
  assert.equal(parsed.searchParams.get('su'), 'Veritas MUN Decision');
  assert.equal(parsed.searchParams.get('body'), rendered);
});

test('QR attendance helpers normalize URLs/tokens, compute counts, and filter state accurately', () => {
  assert.equal(normalizeQrTokenInput('https://veritas.edu/pass?token=vmqr-abc123'), 'VMQR-ABC123');
  assert.equal(normalizeQrTokenInput('  vmqr-xyz999 '), 'VMQR-XYZ999');

  const samplePasses = [
    {
      id: 'p1',
      holder_type: 'staff',
      full_name: 'Omar Ali',
      department: 'Security',
      pass_code: 'VM-11111111',
      active: true,
      checked_in_at: '2026-11-25T08:00:00Z',
      checked_out_at: null
    },
    {
      id: 'p2',
      holder_type: 'applicant',
      full_name: 'Lina Tariq',
      department: 'Volunteers',
      pass_code: 'VM-22222222',
      active: true,
      checked_in_at: '2026-11-25T08:10:00Z',
      checked_out_at: '2026-11-25T16:00:00Z'
    },
    {
      id: 'p3',
      holder_type: 'staff',
      full_name: 'Rami Saleh',
      department: 'IT',
      pass_code: 'VM-33333333',
      active: false,
      checked_in_at: null,
      checked_out_at: null
    }
  ];

  const stats = summarizeQrAttendance(samplePasses);
  assert.deepEqual(stats, {
    totalPasses: 3,
    activePasses: 2,
    checkedIn: 2,
    checkedOut: 1,
    currentlyInside: 1
  });

  assert.equal(filterQrPasses(samplePasses, { state: 'inside' }).length, 1);
  assert.equal(filterQrPasses(samplePasses, { department: 'Volunteers' }).length, 1);
  assert.equal(filterQrPasses(samplePasses, { query: 'VM-22222222' }).length, 1);
});

test('hierarchy cycle detector and locked-decision override validator catch invalid changes', () => {
  const nodes = [
    { id: 'root', parent_position_id: null },
    { id: 'head', parent_position_id: 'root' },
    { id: 'lead', parent_position_id: 'head' }
  ];
  assert.equal(wouldCreateHierarchyCycle(nodes, 'root', 'lead'), true);
  assert.equal(wouldCreateHierarchyCycle(nodes, 'lead', 'lead'), true);
  assert.equal(wouldCreateHierarchyCycle(nodes, 'lead', 'root'), false);

  assert.ok(validateApplicationOverrideReason(true, 'accepted', 'rejected', 'no'));
  assert.equal(validateApplicationOverrideReason(true, 'accepted', 'rejected', 'Applicant withdrew availability'), null);
  assert.equal(validateApplicationOverrideReason(false, 'pending', 'accepted', ''), null);
});
