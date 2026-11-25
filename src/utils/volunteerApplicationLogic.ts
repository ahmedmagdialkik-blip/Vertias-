export type VolunteerGender = 'Male' | 'Female';
export type VolunteerGrade = '10' | '11' | '12' | 'First Year University';
export type VolunteerAttendAllDays = 'yes' | 'no';

export interface VolunteerProofMeta {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface VolunteerFileLike {
  name: string;
  size: number;
  type: string;
}

export interface VolunteerApplicationDraft {
  full_name: string;
  email: string;
  school: string;
  phone: string;
  emergency_contact: string;
  gender: VolunteerGender | '';
  grade: VolunteerGrade | '';
  experience: string;
  why: string;
  role_understanding: string;
  wandering_action: string;
  attend_all_days: VolunteerAttendAllDays | '';
  issues_note: string;
}

export interface VolunteerQuestionMeta {
  number: number;
  key: 'why' | 'role_understanding' | 'wandering_action';
  label: string;
  minWords: number;
}

export const MAX_VOLUNTEER_PROOF_FILES = 10;
export const MAX_VOLUNTEER_PROOF_FILE_BYTES = 1024 * 1024 * 1024; // 1 GB per file

export const ALLOWED_VOLUNTEER_PROOF_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export const ALLOWED_VOLUNTEER_PROOF_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
  'pdf',
  'doc',
  'docx'
]);

export const VOLUNTEER_GRADE_OPTIONS: readonly { value: VolunteerGrade; label: string }[] = [
  { value: '10', label: 'Grade 10' },
  { value: '11', label: 'Grade 11' },
  { value: '12', label: 'Grade 12' },
  { value: 'First Year University', label: 'First Year University' }
];

export const VOLUNTEER_QUESTIONS: readonly VolunteerQuestionMeta[] = [
  {
    number: 10,
    key: 'why',
    label: 'Why do you want to join the Volunteer Department?',
    minWords: 50
  },
  {
    number: 11,
    key: 'role_understanding',
    label: 'What do you understand about the role of a Volunteer at a MUN conference?',
    minWords: 60
  },
  {
    number: 12,
    key: 'wandering_action',
    label:
      'As a volunteer, you witness another volunteer wandering around. What action will you take to ensure the conference runs smoothly?',
    minWords: 70
  }
];

export const EMPTY_VOLUNTEER_DRAFT: VolunteerApplicationDraft = {
  full_name: '',
  email: '',
  school: '',
  phone: '',
  emergency_contact: '',
  gender: '',
  grade: '',
  experience: '',
  why: '',
  role_understanding: '',
  wandering_action: '',
  attend_all_days: '',
  issues_note: ''
};

export function resolveApplyTrack(search: string): 'Volunteers' | 'Security' {
  const params = new URLSearchParams(search || '');
  const raw = (params.get('track') || params.get('department') || '').trim().toLowerCase();
  if (raw === 'security') return 'Security';
  if (raw === 'volunteer' || raw === 'volunteers') return 'Volunteers';
  return 'Volunteers';
}

export function countVolunteerWords(text: string): number {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function formatVolunteerFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isSupportedVolunteerProofFile(file: VolunteerFileLike): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  if (mime && ALLOWED_VOLUNTEER_PROOF_MIME_TYPES.has(mime)) {
    return true;
  }
  const parts = (file.name || '').toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  return ALLOWED_VOLUNTEER_PROOF_EXTENSIONS.has(ext);
}

export function validateVolunteerProofFiles(
  files: readonly VolunteerFileLike[]
): { valid: boolean; error: string | null } {
  if (!files || files.length === 0) {
    return {
      valid: false,
      error: 'Please upload at least 1 proof file. Experiences without proof will not be validated.'
    };
  }
  if (files.length > MAX_VOLUNTEER_PROOF_FILES) {
    return {
      valid: false,
      error: `You can upload up to ${MAX_VOLUNTEER_PROOF_FILES} proof files.`
    };
  }
  for (const file of files) {
    if (!isSupportedVolunteerProofFile(file)) {
      return {
        valid: false,
        error: `"${file.name}" is not a supported file type. Upload images (JPG, PNG, WEBP, GIF, HEIC) or documents (PDF, DOC, DOCX).`
      };
    }
    if (file.size <= 0) {
      return {
        valid: false,
        error: `"${file.name}" appears to be empty.`
      };
    }
    if (file.size > MAX_VOLUNTEER_PROOF_FILE_BYTES) {
      return {
        valid: false,
        error: `"${file.name}" exceeds the 1 GB per-file limit.`
      };
    }
  }
  return { valid: true, error: null };
}

export function buildVolunteerProofStoragePath(
  submissionId: string,
  index: number,
  fileName: string
): string {
  const cleanId = submissionId.replace(/[^a-zA-Z0-9_-]/g, '') || 'submission';
  const baseName = (fileName || 'proof').split(/[\\/]/).pop() || 'proof';
  const safeName = baseName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(-80);
  const safeIndex = Math.max(0, Math.floor(index));
  return `volunteer-proofs/${cleanId}/${safeIndex}-${safeName || 'file'}`;
}

export function isValidVolunteerEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || '').trim().toLowerCase());
}

export function isLikelyVolunteerSchoolAbbreviation(school: string): boolean {
  const t = (school || '').trim();
  if (!t) return false;
  return /^[A-Z]{2,6}$/.test(t) || /^([A-Za-z]\.){2,}$/.test(t);
}

export function hasValidPhoneDigits(value: string): boolean {
  return (value || '').replace(/\D/g, '').length >= 7;
}

export function hasEmergencyRelationship(value: string): boolean {
  const trimmed = (value || '').trim();
  return hasValidPhoneDigits(trimmed) && /[a-zA-Z\u0600-\u06FF]{2,}/.test(trimmed);
}

export function validateVolunteerApplication(
  draft: VolunteerApplicationDraft,
  files: readonly VolunteerFileLike[]
): string | null {
  if (!draft.full_name.trim()) {
    return '1. Please enter your Full Name.';
  }
  if (!isValidVolunteerEmail(draft.email)) {
    return '2. Please enter a valid Email Address.';
  }
  if (!draft.school.trim() || draft.school.trim().length < 3) {
    return '3. Please enter your full School Name without abbreviations.';
  }
  if (isLikelyVolunteerSchoolAbbreviation(draft.school)) {
    return '3. Please write out your full School Name without abbreviations.';
  }
  if (!hasValidPhoneDigits(draft.phone)) {
    return '4. Please enter a valid Phone Number (e.g. 05********).';
  }
  if (!hasEmergencyRelationship(draft.emergency_contact)) {
    return '5. Please enter an Emergency Contact Number and relationship (e.g. 05******/Father).';
  }
  if (draft.gender !== 'Male' && draft.gender !== 'Female') {
    return '6. Please select your Gender.';
  }
  if (!['10', '11', '12', 'First Year University'].includes(draft.grade)) {
    return '7. Please select your Grade.';
  }
  if (!draft.experience.trim()) {
    return '8. Kindly list your past experiences (e.g. ICONMUN / Volunteer / BEST).';
  }

  const proofCheck = validateVolunteerProofFiles(files);
  if (!proofCheck.valid) {
    return `9. ${proofCheck.error}`;
  }

  for (const q of VOLUNTEER_QUESTIONS) {
    const answer = draft[q.key].trim();
    if (!answer) {
      return `${q.number}. Please answer: "${q.label}"`;
    }
    const words = countVolunteerWords(answer);
    if (words < q.minWords) {
      return `${q.number}. Please write at least ${q.minWords} words for "${q.label}" (currently ${words} words).`;
    }
  }

  if (draft.attend_all_days !== 'yes' && draft.attend_all_days !== 'no') {
    return '13. Please select whether you will be able to attend all days.';
  }

  return null;
}

export function normalizeVolunteerIssuesNote(note: string): string {
  const trimmed = (note || '').trim();
  return trimmed || 'N/A';
}
