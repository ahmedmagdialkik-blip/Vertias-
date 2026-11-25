import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommitteeLogoStoragePath,
  canManageWebsiteOperations,
  DEFAULT_APPLICATION_SETTINGS,
  formatTrackStatusLabel,
  getPublicCommittees,
  getVisiblePublicTracks,
  isTrackCurrentlyOpen,
  moveCommitteeOrder,
  normalizeApplicationSettings,
  normalizeCommitteeRows,
  sanitizeCommitteeLogoUrl,
  sortCommittees,
  validateApplicationSettings,
  validateCommitteeInput,
  type CommitteeRecord
} from './committeesAndSettingsLogic';

test('normalizeApplicationSettings applies defaults and respects independent track flags', () => {
  const fallback = normalizeApplicationSettings(null);
  assert.equal(fallback.volunteer.open, true);
  assert.equal(fallback.security.open, true);
  assert.equal(fallback.volunteer.visible, true);
  assert.equal(fallback.security.visible, true);

  const parsed = normalizeApplicationSettings({
    description: 'Join a Veritas MUN department team.',
    volunteer: { open: true, visible: true, button_text: 'Volunteer With Us' },
    security: { open: false, visible: true, button_text: 'Security Team' }
  });

  assert.equal(parsed.description, 'Join a Veritas MUN department team.');
  assert.equal(parsed.volunteer.open, true);
  assert.equal(parsed.security.open, false);
  assert.equal(formatTrackStatusLabel(parsed.volunteer.open), 'OPEN');
  assert.equal(formatTrackStatusLabel(parsed.security.open), 'CLOSED');
  assert.equal(isTrackCurrentlyOpen(parsed, 'Volunteers'), true);
  assert.equal(isTrackCurrentlyOpen(parsed, 'Security'), false);
});

test('getVisiblePublicTracks omits hidden tracks and preserves independent open/closed labels', () => {
  const settings = normalizeApplicationSettings({
    description: 'Department recruitment status.',
    volunteer: { open: true, visible: true, button_text: 'Apply for Volunteers' },
    security: { open: false, visible: false, button_text: 'Apply for Security' }
  });

  const visible = getVisiblePublicTracks(settings);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].key, 'volunteer');
  assert.equal(visible[0].statusLabel, 'OPEN');
  assert.equal(visible[0].buttonText, 'Apply for Volunteers');
});

test('validateApplicationSettings checks description and visible button labels', () => {
  assert.equal(validateApplicationSettings(DEFAULT_APPLICATION_SETTINGS), null);
  assert.match(
    validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      description: '   '
    }) || '',
    /short description/i
  );
  assert.match(
    validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      security: { open: true, visible: true, button_text: '   ' }
    }) || '',
    /Security button text/i
  );
  // Hidden track can keep empty draft text without blocking
  assert.equal(
    validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      security: { open: false, visible: false, button_text: '' }
    }),
    null
  );
});

test('committee validation, URL sanitization, sorting, public filtering, and reordering work cleanly', () => {
  assert.equal(sanitizeCommitteeLogoUrl('https://cdn.example.com/unsc.png'), 'https://cdn.example.com/unsc.png');
  assert.equal(sanitizeCommitteeLogoUrl('/assets/unsc.png'), '/assets/unsc.png');
  assert.equal(sanitizeCommitteeLogoUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeCommitteeLogoUrl('data:image/png;base64,AAA'), '');

  assert.match(validateCommitteeInput({ name: ' ', description: 'Council' }) || '', /name/i);
  assert.match(validateCommitteeInput({ name: 'UNSC', description: ' ' }) || '', /description/i);
  assert.match(
    validateCommitteeInput({ name: 'UNSC', description: 'Peace and security', image_url: 'javascript:bad()' }) || '',
    /URL/i
  );
  assert.equal(
    validateCommitteeInput({ name: 'UNSC', description: 'Peace and security', image_url: 'https://example.com/logo.png' }),
    null
  );

  const sample: CommitteeRecord[] = [
    { id: 'c2', name: 'WHO', description: 'Health', image_url: '', sort_order: 1, enabled: false },
    { id: 'c1', name: 'UNSC', description: 'Security', image_url: 'https://example.com/unsc.png', sort_order: 0, enabled: true },
    { id: 'c3', name: 'DISEC', description: 'Disarmament', image_url: '', sort_order: 2, enabled: true }
  ];

  assert.deepEqual(
    sortCommittees(sample).map(c => c.id),
    ['c1', 'c2', 'c3']
  );
  assert.deepEqual(
    getPublicCommittees(sample).map(c => c.id),
    ['c1', 'c3']
  );

  const reordered = moveCommitteeOrder(sample, 'c3', 'up');
  assert.deepEqual(
    reordered.map(c => [c.id, c.sort_order]),
    [
      ['c1', 0],
      ['c3', 1],
      ['c2', 2]
    ]
  );

  const normalized = normalizeCommitteeRows([
    { id: 'a', name: 'UNHRC', description: 'Human Rights', image_url: 'javascript:x', sort_order: 0, enabled: true },
    { id: 'b', name: '', description: 'Invalid empty name', sort_order: 1, enabled: true }
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].image_url, '');
});

test('buildCommitteeLogoStoragePath and canManageWebsiteOperations enforce naming and roles', () => {
  const path = buildCommitteeLogoStoragePath('Security Council (Crisis)', 'crest.webp', 1700000000);
  assert.equal(path, 'committees/1700000000-security-council-crisis.webp');

  assert.equal(canManageWebsiteOperations('admin'), true);
  assert.equal(canManageWebsiteOperations('head'), false);
  assert.equal(canManageWebsiteOperations('member'), false);
  assert.equal(canManageWebsiteOperations(undefined), false);
});
