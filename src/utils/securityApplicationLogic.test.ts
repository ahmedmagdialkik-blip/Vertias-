import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProofStoragePath,
  countWords,
  EMPTY_SECURITY_DRAFT,
  exportApplicationsToCsv,
  formatFileSize,
  isLikelySchoolAbbreviation,
  MAX_PROOF_FILE_BYTES,
  MAX_PROOF_FILES,
  validateCompleteSecurityApplication,
  validateProofFiles,
  validateSecurityStep,
  type SecurityApplicationDraft
} from './securityApplicationLogic';

function validDraft(): SecurityApplicationDraft {
  return {
    full_name: 'Tariq Al-Mansoor',
    email: 'tariq@example.edu',
    school: 'Modern Montessori School',
    phone: '0591234567',
    emergency_contact: '0597654321/Mother',
    gender: 'Male',
    grade: '11',
    experience: 'ICON MUN/Security/Best Security Member',
    why: 'I want to contribute to a calm and respectful environment during committee sessions.',
    role_understanding: 'Security maintains delegate safety, venue access control, and peaceful hallways.',
    fight_precautions: 'Separate both delegates calmly, ensure immediate physical safety, call the Security Head, and document what occurred.',
    rules_enforcement: 'Maintain visible presence, remind delegates politely of expectations, and escalate repeated breaches to heads.',
    attend_all_days: 'yes',
    issues_note: 'N/A'
  };
}

const sampleProof = [{ name: 'certificate.jpg', size: 250_000, type: 'image/jpeg' }];

test('countWords counts words accurately across whitespace', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n  '), 0);
  assert.equal(countWords('One  two\nthree\tfour'), 4);
});

test('validateProofFiles enforces 1..10 count, supported types, and 100 MB limit', () => {
  assert.equal(validateProofFiles([]).valid, false);

  const tooMany = Array.from({ length: MAX_PROOF_FILES + 1 }, (_, i) => ({
    name: `p${i}.png`,
    size: 1000,
    type: 'image/png'
  }));
  assert.equal(validateProofFiles(tooMany).valid, false);

  assert.equal(
    validateProofFiles([{ name: 'malware.exe', size: 1000, type: 'application/x-msdownload' }]).valid,
    false
  );
  assert.equal(
    validateProofFiles([{ name: 'huge.pdf', size: MAX_PROOF_FILE_BYTES + 1, type: 'application/pdf' }]).valid,
    false
  );
  assert.equal(
    validateProofFiles([
      { name: 'badge.webp', size: 1024, type: 'image/webp' },
      { name: 'letter.pdf', size: 500_000, type: 'application/pdf' }
    ]).valid,
    true
  );
});

test('buildProofStoragePath strips traversal and unsafe chars', () => {
  const p = buildProofStoragePath('abc-123', 2, '../../weird file (1).png');
  assert.equal(p, 'security-proofs/abc-123/2-weird_file__1_.png');
  assert.ok(!p.includes('..'));
});

test('isLikelySchoolAbbreviation catches short acronyms but allows full school names', () => {
  assert.equal(isLikelySchoolAbbreviation('IAA'), true);
  assert.equal(isLikelySchoolAbbreviation('A.B.S.'), true);
  assert.equal(isLikelySchoolAbbreviation('International Academy Amman'), false);
});

test('validateSecurityStep & validateCompleteSecurityApplication verify all 15 Security fields', () => {
  const full = validDraft();
  assert.equal(validateCompleteSecurityApplication(full, sampleProof), null);

  assert.ok(validateSecurityStep(1, EMPTY_SECURITY_DRAFT, sampleProof));
  assert.ok(validateSecurityStep(1, { ...full, school: 'ABS' }, sampleProof));
  assert.ok(validateSecurityStep(2, full, []));
  assert.ok(validateSecurityStep(3, { ...full, issues_note: '' }, sampleProof));
  assert.ok(validateSecurityStep(3, { ...full, attend_all_days: '' }, sampleProof));
});

test('formatFileSize formats bytes, KB, and MB cleanly', () => {
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
  assert.equal(formatFileSize(5 * 1024 * 1024), '5.0 MB');
});

test('exportApplicationsToCsv escapes CSV spreadsheet formula prefixes', () => {
  const csv = exportApplicationsToCsv([
    {
      track: 'Security',
      status: 'pending',
      full_name: '=CMD|calc',
      email: 'a@b.com',
      proof_urls: [{ name: 'a.jpg' }]
    }
  ]);
  assert.ok(csv.includes('"\'=CMD|calc"'));
  assert.ok(csv.includes('"1"'));
});
