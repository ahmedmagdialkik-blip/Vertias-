import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVolunteerProofStoragePath,
  countVolunteerWords,
  EMPTY_VOLUNTEER_DRAFT,
  formatVolunteerFileSize,
  MAX_VOLUNTEER_PROOF_FILES,
  MAX_VOLUNTEER_PROOF_FILE_BYTES,
  normalizeVolunteerIssuesNote,
  resolveApplyTrack,
  validateVolunteerApplication,
  validateVolunteerProofFiles,
  VOLUNTEER_QUESTIONS,
  type VolunteerApplicationDraft,
  type VolunteerFileLike
} from './volunteerApplicationLogic';

function makeWords(count: number): string {
  return Array.from({ length: count }, (_, idx) => `word${idx + 1}`).join(' ');
}

function makeValidDraft(): VolunteerApplicationDraft {
  return {
    full_name: 'Nadia Al-Mansoor',
    email: 'nadia.mansoor@example.com',
    school: 'International Academy Amman',
    phone: '0501234567',
    emergency_contact: '0598765432/Father',
    gender: 'Female',
    grade: '11',
    experience: 'ICONMUN / Volunteer / BEST',
    why: makeWords(52),
    role_understanding: makeWords(63),
    wandering_action: makeWords(74),
    attend_all_days: 'yes',
    issues_note: ''
  };
}

const VALID_FILE: VolunteerFileLike = {
  name: 'certificate.pdf',
  size: 2048,
  type: 'application/pdf'
};

test('resolveApplyTrack defaults to Volunteers when open and preserves Security separately', () => {
  assert.equal(resolveApplyTrack(''), 'Volunteers');
  assert.equal(resolveApplyTrack('?track=volunteers'), 'Volunteers');
  assert.equal(resolveApplyTrack('?department=volunteer'), 'Volunteers');
  assert.equal(resolveApplyTrack('?track=security'), 'Security');
  assert.equal(resolveApplyTrack('?department=security'), 'Security');
});

test('VOLUNTEER_QUESTIONS preserves exact question order and word minimums', () => {
  assert.deepEqual(
    VOLUNTEER_QUESTIONS.map(q => ({ number: q.number, key: q.key, minWords: q.minWords })),
    [
      { number: 10, key: 'why', minWords: 50 },
      { number: 11, key: 'role_understanding', minWords: 60 },
      { number: 12, key: 'wandering_action', minWords: 70 }
    ]
  );
  assert.equal(countVolunteerWords('one two   three\nfour'), 4);
});

test('validateVolunteerApplication succeeds on complete 14-question submission with optional Q14 blank', () => {
  const err = validateVolunteerApplication(makeValidDraft(), [VALID_FILE]);
  assert.equal(err, null);
  assert.equal(normalizeVolunteerIssuesNote(''), 'N/A');
  assert.equal(normalizeVolunteerIssuesNote('  Allergic to peanuts  '), 'Allergic to peanuts');
});

test('validateVolunteerApplication rejects school abbreviations and missing emergency relationship', () => {
  const draft = makeValidDraft();
  draft.school = 'IAA';
  assert.match(validateVolunteerApplication(draft, [VALID_FILE]) || '', /abbreviations/i);

  const draft2 = makeValidDraft();
  draft2.emergency_contact = '0598765432';
  assert.match(validateVolunteerApplication(draft2, [VALID_FILE]) || '', /relationship/i);
});

test('validateVolunteerApplication enforces minimum 50, 60, and 70 words for Q10-Q12', () => {
  const shortWhy = makeValidDraft();
  shortWhy.why = makeWords(49);
  assert.match(validateVolunteerApplication(shortWhy, [VALID_FILE]) || '', /at least 50 words/i);

  const shortRole = makeValidDraft();
  shortRole.role_understanding = makeWords(59);
  assert.match(validateVolunteerApplication(shortRole, [VALID_FILE]) || '', /at least 60 words/i);

  const shortAction = makeValidDraft();
  shortAction.wandering_action = makeWords(69);
  assert.match(validateVolunteerApplication(shortAction, [VALID_FILE]) || '', /at least 70 words/i);
});

test('validateVolunteerProofFiles allows up to 10 files and up to 1 GB per file', () => {
  assert.equal(validateVolunteerProofFiles([]).valid, false);

  const tenFiles = Array.from({ length: MAX_VOLUNTEER_PROOF_FILES }, (_, idx) => ({
    name: `proof-${idx}.png`,
    size: 1024,
    type: 'image/png'
  }));
  assert.equal(validateVolunteerProofFiles(tenFiles).valid, true);

  const elevenFiles = [...tenFiles, VALID_FILE];
  assert.equal(validateVolunteerProofFiles(elevenFiles).valid, false);

  const atLimit: VolunteerFileLike = {
    name: 'video-portfolio.pdf',
    size: MAX_VOLUNTEER_PROOF_FILE_BYTES,
    type: 'application/pdf'
  };
  assert.equal(validateVolunteerProofFiles([atLimit]).valid, true);

  const overLimit: VolunteerFileLike = {
    name: 'too-big.pdf',
    size: MAX_VOLUNTEER_PROOF_FILE_BYTES + 1,
    type: 'application/pdf'
  };
  assert.match(validateVolunteerProofFiles([overLimit]).error || '', /1 GB/i);
  assert.equal(formatVolunteerFileSize(MAX_VOLUNTEER_PROOF_FILE_BYTES), '1.00 GB');
});

test('buildVolunteerProofStoragePath namespaces safely under volunteer-proofs', () => {
  const path = buildVolunteerProofStoragePath('sub-123', 0, '../my proof (1).pdf');
  assert.equal(path, 'volunteer-proofs/sub-123/0-my_proof__1_.pdf');
});

test('EMPTY_VOLUNTEER_DRAFT starts clean and invalid', () => {
  assert.ok(validateVolunteerApplication(EMPTY_VOLUNTEER_DRAFT, []));
});
