import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortalNotifications,
  computeApplicationMetrics,
  filterAndSortApplications,
  getAuthorizedNavItems,
  getDefaultSectionForRole,
  isSectionAuthorized,
  type AnnouncementRecordLike,
  type ApplicationRecordLike
} from './portalAdminLogic';

const sampleApps: ApplicationRecordLike[] = [
  {
    id: '1',
    track: 'Security',
    full_name: 'Zaid Al-Harbi',
    email: 'zaid@example.edu',
    school: 'Modern Montessori School',
    attend_all_days: true,
    status: 'pending',
    recommendation: 'accept',
    recommended_at: '2026-11-22T12:00:00Z',
    created_at: '2026-11-20T10:00:00Z'
  },
  {
    id: '2',
    track: 'Volunteers',
    full_name: 'Mira Haddad',
    email: 'mira@example.edu',
    school: 'Amman Baccalaureate School',
    attend_all_days: false,
    status: 'pending',
    recommendation: null,
    created_at: '2026-11-23T08:00:00Z'
  },
  {
    id: '3',
    track: 'Security',
    full_name: 'Adam Nasser',
    email: 'adam@example.edu',
    school: 'International Academy',
    attend_all_days: true,
    status: 'accepted',
    recommendation: 'accept',
    created_at: '2026-11-18T09:00:00Z'
  }
];

test('getAuthorizedNavItems enforces strict RBAC visibility for admin, heads, and members', () => {
  const adminNav = getAuthorizedNavItems('admin', 'IT');
  assert.equal(adminNav.length, 10);
  assert.ok(adminNav.some(i => i.id === 'overview'));
  assert.ok(adminNav.some(i => i.id === 'settings'));

  const secHeadNav = getAuthorizedNavItems('head', 'Security');
  assert.deepEqual(
    secHeadNav.map(i => i.id),
    ['security_applications', 'account']
  );
  assert.equal(isSectionAuthorized('overview', 'head', 'Security'), false);
  assert.equal(isSectionAuthorized('volunteer_applications', 'head', 'Security'), false);
  assert.equal(isSectionAuthorized('security_applications', 'head', 'Security'), true);

  const volHeadNav = getAuthorizedNavItems('head', 'Volunteers');
  assert.deepEqual(
    volHeadNav.map(i => i.id),
    ['volunteer_applications', 'account']
  );
  assert.equal(getDefaultSectionForRole('head', 'Volunteers'), 'volunteer_applications');

  const memberNav = getAuthorizedNavItems('member', 'Media');
  assert.equal(memberNav.length, 0);
});

test('filterAndSortApplications filters by track, status, availability, search query, and sorts reliably', () => {
  const onlySecurityPending = filterAndSortApplications(sampleApps, {
    track: 'Security',
    status: 'pending'
  });
  assert.equal(onlySecurityPending.length, 1);
  assert.equal(onlySecurityPending[0].id, '1');

  const cannotAttend = filterAndSortApplications(sampleApps, { availability: 'no' });
  assert.equal(cannotAttend.length, 1);
  assert.equal(cannotAttend[0].full_name, 'Mira Haddad');

  const byQuery = filterAndSortApplications(sampleApps, { query: 'montessori' });
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].id, '1');

  const byName = filterAndSortApplications(sampleApps, { sortBy: 'name' });
  assert.deepEqual(
    byName.map(a => a.full_name),
    ['Adam Nasser', 'Mira Haddad', 'Zaid Al-Harbi']
  );
});

test('computeApplicationMetrics computes accurate live counts', () => {
  const metrics = computeApplicationMetrics(sampleApps);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.pending, 2);
  assert.equal(metrics.accepted, 1);
  assert.equal(metrics.rejected, 0);
  assert.equal(metrics.recommendedAwaitingDecision, 1);
  assert.equal(metrics.securityCount, 2);
  assert.equal(metrics.volunteerCount, 1);
});

test('buildPortalNotifications returns real recommendations, pending applications, and announcements sorted newest-first', () => {
  const announcements: AnnouncementRecordLike[] = [
    {
      id: 'a1',
      title: 'Briefing Room B',
      body: 'Secretariat meeting at 16:00',
      audience: 'heads',
      created_at: '2026-11-24T09:00:00Z'
    }
  ];

  const adminNotifs = buildPortalNotifications(sampleApps, announcements, {
    id: 'u1',
    role: 'admin',
    active: true
  });

  assert.equal(adminNotifs.length, 3);
  assert.equal(adminNotifs[0].kind, 'announcement');
  assert.equal(adminNotifs[1].kind, 'pending_review');
  assert.equal(adminNotifs[2].kind, 'recommendation');
  assert.equal(adminNotifs[2].targetSection, 'security_applications');
});
