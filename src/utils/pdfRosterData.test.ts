import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_PDF_ROSTER,
  PDF_DEPARTMENTS,
  getRosterRegistrationStatus,
  isValidNullableEmail,
  normalizeNullableEmail,
  planPdfRosterSync,
  resolveRosterAccountRole,
  summarizeOfficialPdfRoster
} from './pdfRosterData.ts';

test('OFFICIAL_PDF_ROSTER captures all 37 people across 13 departments and pages 1-3', () => {
  const summary = summarizeOfficialPdfRoster(OFFICIAL_PDF_ROSTER);
  assert.equal(summary.totalPeople, 37);
  assert.equal(summary.validEmailCount, 33);
  assert.equal(summary.missingEmailCount, 4);
  assert.equal(summary.departmentCount, 13);
  assert.deepEqual(summary.departments, [...PDF_DEPARTMENTS]);

  const missingNames = summary.missingEmailNames.map(x => x.full_name);
  assert.deepEqual(missingNames, [
    'zain rawasheda',
    'Meshal alqahtani',
    'Adam Abu Taleb',
    'lily rabia'
  ]);

  // Every valid email is lowercase, valid format, and unique
  const seenEmails = new Set<string>();
  for (const person of OFFICIAL_PDF_ROSTER) {
    assert.ok(person.full_name.trim().length > 0);
    assert.ok(isValidNullableEmail(person.email), `Invalid email for ${person.full_name}`);
    if (person.email !== null) {
      assert.equal(person.email, person.email.trim().toLowerCase());
      assert.ok(!seenEmails.has(person.email), `Duplicate email ${person.email}`);
      seenEmails.add(person.email);
    }
  }
  assert.equal(seenEmails.size, 33);

  // Verify pages 1, 2, 3 are all represented (including HR continuation on page 2 & PR on page 3)
  assert.equal(OFFICIAL_PDF_ROSTER.filter(e => e.page === 1).length, 16);
  assert.equal(OFFICIAL_PDF_ROSTER.filter(e => e.page === 2).length, 20);
  assert.equal(OFFICIAL_PDF_ROSTER.filter(e => e.page === 3).length, 1);
});

test('resolveRosterAccountRole enforces Secretariat, IT, Heads, Co-heads, Advisors, and Members accurately', () => {
  for (const entry of OFFICIAL_PDF_ROSTER) {
    assert.equal(
      resolveRosterAccountRole(entry.department, entry.position),
      entry.intended_role,
      `Role mismatch for ${entry.full_name} (${entry.department} / ${entry.position})`
    );
  }

  // Spot-check critical cases
  assert.equal(resolveRosterAccountRole('Secretaries', 'SG'), 'admin');
  assert.equal(resolveRosterAccountRole('IT', 'Co-head'), 'admin');
  assert.equal(resolveRosterAccountRole('Security', 'Co Female Head'), 'head');
  assert.equal(resolveRosterAccountRole('DCC', 'Co-head'), 'head');
  assert.equal(resolveRosterAccountRole('PR', 'Head'), 'head');
  assert.equal(resolveRosterAccountRole('Senior Advisors', 'Senior Advisor'), 'advisor');
  assert.equal(resolveRosterAccountRole('Marketing', 'Member'), 'member');
  assert.equal(resolveRosterAccountRole('Logistics', 'Member'), 'member');
});

test('getRosterRegistrationStatus distinguishes registered, pending, and incomplete entries', () => {
  const profiles = [
    { id: 'u1', roster_id: 'r-ahmed', email: 'ahmedmagdilkik@gmail.com', role: 'admin', active: true },
    { id: 'u2', roster_id: null, email: 'danaissuperr@gmail.com', role: 'head', active: true }
  ];

  assert.equal(
    getRosterRegistrationStatus({ id: 'r-ahmed', email: 'ahmedmagdilkik@gmail.com' }, profiles),
    'registered'
  );
  assert.equal(
    getRosterRegistrationStatus({ id: 'r-dana', email: 'DANAISSUPERR@gmail.com' }, profiles),
    'registered'
  );
  assert.equal(
    getRosterRegistrationStatus({ id: 'r-laila', email: 'sarasamisara091@gmail.com' }, profiles),
    'pending'
  );
  assert.equal(
    getRosterRegistrationStatus({ id: 'r-zain', email: null }, profiles),
    'incomplete'
  );
  assert.equal(
    getRosterRegistrationStatus({ id: 'r-zain', email: '   ' }, profiles),
    'incomplete'
  );
});

test('planPdfRosterSync preserves Ahmed Magdi and skips already-imported emails and incomplete entries', () => {
  const existing = [
    { full_name: 'Ahmed Magdi', email: 'AHMEDMAGDILKIK@gmail.com', department: 'IT' },
    { full_name: 'zain rawasheda', email: null, department: 'Secretaries' }
  ];

  const plan = planPdfRosterSync(existing);
  assert.equal(plan.alreadyPresentCount, 2);
  assert.equal(plan.toInsertWithEmail.length, 32);
  assert.equal(plan.toInsertMissingEmail.length, 3);
  assert.ok(!plan.toInsertWithEmail.some(e => normalizeNullableEmail(e.email) === 'ahmedmagdilkik@gmail.com'));
  assert.ok(!plan.toInsertMissingEmail.some(e => e.full_name.toLowerCase() === 'zain rawasheda'));
});
