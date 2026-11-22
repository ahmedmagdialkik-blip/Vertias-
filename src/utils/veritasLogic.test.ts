import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConferenceForm,
  projectSpherePoint,
  stepGlobeVelocity,
  resolveInitialMode,
  computeScrollProgress,
  computeCardTilt,
  resolveNavbarVisibility,
  computeGlobeMagnetOffset,
  computeMagneticButtonOffset,
  stepSpringPhoto,
  shouldRevealOnScroll,
} from './veritasLogic';

test('validateConferenceForm rejects empty registration fields', () => {
  const result = validateConferenceForm({
    mode: 'register',
    fullName: '',
    email: 'invalid-email',
    institution: '',
    committee: '',
    experience: 'First-time',
    message: '',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.fullName);
  assert.ok(result.errors.email);
  assert.ok(result.errors.institution);
  assert.ok(result.errors.committee);
});

test('validateConferenceForm accepts valid delegate registration', () => {
  const result = validateConferenceForm({
    mode: 'register',
    fullName: 'Elena Vance',
    email: 'elena.vance@university.edu',
    institution: 'Geneva Institute of Diplomacy',
    committee: 'UNSC',
    experience: 'Intermediate',
    message: '',
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
});

test('validateConferenceForm requires message in contact mode', () => {
  const failResult = validateConferenceForm({
    mode: 'contact',
    fullName: 'Marcus Chen',
    email: 'marcus@example.org',
    institution: '',
    committee: '',
    experience: '',
    message: 'Hi',
  });
  assert.equal(failResult.valid, false);
  assert.ok(failResult.errors.message);

  const okResult = validateConferenceForm({
    mode: 'contact',
    fullName: 'Marcus Chen',
    email: 'marcus@example.org',
    institution: '',
    committee: '',
    experience: '',
    message: 'Could you share group delegation fee details for 12 delegates?',
  });
  assert.equal(okResult.valid, true);
});

test('projectSpherePoint preserves radius magnitude', () => {
  const radius = 200;
  const pt = projectSpherePoint(35, 60, 0.75, 0.32, radius);
  const mag = Math.hypot(pt.x, pt.y, pt.z);
  assert.ok(Math.abs(mag - radius) < 1e-6);
});

test('stepGlobeVelocity accelerates on scroll and eases back toward base speed', () => {
  const spiked = stepGlobeVelocity(0, 180, 0.016);
  assert.ok(spiked.angularSpeed > 0.3);

  let boost = spiked.nextBoost;
  for (let i = 0; i < 120; i++) {
    boost = stepGlobeVelocity(boost, 0, 0.016).nextBoost;
  }
  const settled = stepGlobeVelocity(boost, 0, 0.016);
  assert.ok(settled.angularSpeed < 0.16);
});

test('resolveInitialMode skips intro for reduced motion or autostart=1', () => {
  assert.equal(resolveInitialMode('', false), 'intro');
  assert.equal(resolveInitialMode('?autostart=1', false), 'ready');
  assert.equal(resolveInitialMode('', true), 'ready');
});

test('computeScrollProgress clamps between 0 and 1', () => {
  assert.equal(computeScrollProgress(0, 900, 900), 0);
  assert.equal(computeScrollProgress(500, 1900, 900), 0.5);
  assert.equal(computeScrollProgress(2000, 1900, 900), 1);
  assert.equal(computeScrollProgress(-50, 1900, 900), 0);
});

test('computeCardTilt respects 6deg limit and reduced motion', () => {
  const tilted = computeCardTilt(2, -2, 6, false);
  assert.equal(tilted.rotateX, 6);
  assert.equal(tilted.rotateY, 6);

  const reduced = computeCardTilt(1, 1, 6, true);
  assert.deepEqual(reduced, { rotateX: 0, rotateY: 0 });
});

test('resolveNavbarVisibility keeps navbar visible near top or with focus', () => {
  assert.equal(resolveNavbarVisibility(40, 20, false), 'visible');
  assert.equal(resolveNavbarVisibility(400, 18, false), 'hidden');
  assert.equal(resolveNavbarVisibility(400, 18, true), 'visible');
  assert.equal(resolveNavbarVisibility(400, -12, false), 'visible');
});

test('computeGlobeMagnetOffset pulls vertices toward cursor within radius and leaves distant vertices unchanged', () => {
  const inside = computeGlobeMagnetOffset(100, 100, 160, 100, 200, 1, 22);
  assert.ok(inside.x > 100 && inside.x <= 122);
  assert.equal(inside.y, 100);
  assert.ok(inside.glow > 0 && inside.glow < 1);

  const outside = computeGlobeMagnetOffset(100, 100, 500, 500, 200, 1, 22);
  assert.deepEqual(outside, { x: 100, y: 100, glow: 0 });
});

test('computeMagneticButtonOffset follows cursor near button and zeros on reducedMotion', () => {
  const near = computeMagneticButtonOffset(200, 300, 140, 46, 250, 310, 9, 24, false);
  assert.ok(near.x > 0 && near.x <= 9);
  assert.ok(near.y > 0 && near.y <= 9);

  const far = computeMagneticButtonOffset(200, 300, 140, 46, 600, 300, 9, 24, false);
  assert.deepEqual(far, { x: 0, y: 0 });

  const reduced = computeMagneticButtonOffset(200, 300, 140, 46, 220, 305, 9, 24, true);
  assert.deepEqual(reduced, { x: 0, y: 0 });
});

test('stepSpringPhoto settles displaced photo cleanly back to rest', () => {
  let state = { x: 120, y: -60, vx: 80, vy: -40 };
  for (let i = 0; i < 180; i++) {
    state = stepSpringPhoto(state, 0.016);
  }
  assert.deepEqual(state, { x: 0, y: 0, vx: 0, vy: 0 });
});

test('shouldRevealOnScroll triggers within viewport threshold or immediately with reduced motion', () => {
  assert.equal(shouldRevealOnScroll(700, 820, 120, 900, 0.88, false), true);
  assert.equal(shouldRevealOnScroll(840, 960, 120, 900, 0.88, false), false);
  assert.equal(shouldRevealOnScroll(1200, 1320, 120, 900, 0.88, true), true);
});


