export type SecurityGender = 'Male' | 'Female';
export type SecurityGrade = '10' | '11' | '12' | 'First Year University';
export type AttendAllDaysOption = 'yes' | 'no';

export interface SecurityProofMeta {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface SecurityApplicationDraft {
  full_name: string;
  email: string;
  school: string;
  phone: string;
  emergency_contact: string;
  gender: SecurityGender | '';
  grade: SecurityGrade | '';
  experience: string;
  why: string;
  role_understanding: string;
  fight_precautions: string;
  rules_enforcement: string;
  attend_all_days: AttendAllDaysOption | '';
  issues_note: string;
}

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export interface SecurityQuestionMeta {
  key: 'why' | 'role_understanding' | 'fight_precautions' | 'rules_enforcement';
  label: string;
  targetWords: number;
  hint: string;
}

export const MAX_PROOF_FILES = 10;
export const MAX_PROOF_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB per file (matches private Supabase bucket)

export const ALLOWED_PROOF_MIME_TYPES = new Set([
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

export const ALLOWED_PROOF_EXTENSIONS = new Set([
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

export const SECURITY_QUESTIONS: readonly SecurityQuestionMeta[] = [
  {
    key: 'why',
    label: 'Why do you want to join the Security Department?',
    targetWords: 50,
    hint: '50 words target'
  },
  {
    key: 'role_understanding',
    label: 'What do you understand about the role of Security at a MUN conference?',
    targetWords: 60,
    hint: '60 words target'
  },
  {
    key: 'fight_precautions',
    label: 'If two delegates are fighting during the break, what precautions will you take ?',
    targetWords: 70,
    hint: '70 words target'
  },
  {
    key: 'rules_enforcement',
    label: 'How would you ensure participants follow conference rules?',
    targetWords: 60,
    hint: '60 words target'
  }
];

export const EMPTY_SECURITY_DRAFT: SecurityApplicationDraft = {
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
  fight_precautions: '',
  rules_enforcement: '',
  attend_all_days: '',
  issues_note: ''
};

export function countWords(text: string): number {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSupportedProofFile(file: FileLike): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  if (mime && ALLOWED_PROOF_MIME_TYPES.has(mime)) {
    return true;
  }
  const parts = (file.name || '').toLowerCase().split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  return ALLOWED_PROOF_EXTENSIONS.has(ext);
}

export function validateProofFiles(files: readonly FileLike[]): { valid: boolean; error: string | null } {
  if (!files || files.length === 0) {
    return {
      valid: false,
      error: 'Please upload at least 1 proof file (experience will not be counted without proof).'
    };
  }
  if (files.length > MAX_PROOF_FILES) {
    return {
      valid: false,
      error: `You can upload at most ${MAX_PROOF_FILES} proof files.`
    };
  }
  for (const file of files) {
    if (!isSupportedProofFile(file)) {
      return {
        valid: false,
        error: `"${file.name}" is not a supported file type. Upload images (JPG, PNG, WEBP, HEIC) or documents (PDF, DOC, DOCX).`
      };
    }
    if (file.size <= 0) {
      return {
        valid: false,
        error: `"${file.name}" appears to be empty.`
      };
    }
    if (file.size > MAX_PROOF_FILE_BYTES) {
      return {
        valid: false,
        error: `"${file.name}" exceeds the 10 MB per-file limit.`
      };
    }
  }
  return { valid: true, error: null };
}

export function buildProofStoragePath(submissionId: string, index: number, fileName: string): string {
  const cleanId = submissionId.replace(/[^a-zA-Z0-9_-]/g, '') || 'submission';
  const baseName = (fileName || 'proof').split(/[\\/]/).pop() || 'proof';
  const safeName = baseName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(-80);
  const safeIndex = Math.max(0, Math.floor(index));
  return `security-proofs/${cleanId}/${safeIndex}-${safeName || 'file'}`;
}

export function isValidSecurityEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || '').trim().toLowerCase());
}

export function isLikelySchoolAbbreviation(school: string): boolean {
  const t = (school || '').trim();
  if (!t) return false;
  // Detect short all-caps acronyms like "ABS", "IAA", "KIS" or dot-separated initials like "A.B.S."
  return /^[A-Z]{2,6}$/.test(t) || /^([A-Za-z]\.){2,}$/.test(t);
}

export function validateSecurityStep(
  step: 1 | 2 | 3,
  draft: SecurityApplicationDraft,
  files: readonly FileLike[]
): string | null {
  if (step === 1) {
    if (!draft.full_name.trim()) return 'Please enter your full name.';
    if (!isValidSecurityEmail(draft.email)) return 'Please enter a valid email address.';
    if (!draft.school.trim() || draft.school.trim().length < 3) {
      return 'Please enter your full school name without abbreviations.';
    }
    if (isLikelySchoolAbbreviation(draft.school)) {
      return 'Please write out your full school name without abbreviations.';
    }
    if (!draft.phone.trim() || draft.phone.trim().length < 7) {
      return 'Please enter your phone number (e.g. 05*****).';
    }
    if (!draft.emergency_contact.trim() || draft.emergency_contact.trim().length < 5) {
      return 'Please enter an emergency contact (e.g. 05*****/Mother).';
    }
    if (draft.gender !== 'Male' && draft.gender !== 'Female') {
      return 'Please select your gender.';
    }
    if (!['10', '11', '12', 'First Year University'].includes(draft.grade)) {
      return 'Please select your grade.';
    }
    return null;
  }

  if (step === 2) {
    if (!draft.experience.trim()) {
      return 'Please list your previous experiences (e.g. ICON MUN/Security/Best Security Member).';
    }
    const proofCheck = validateProofFiles(files);
    if (!proofCheck.valid) return proofCheck.error;
    return null;
  }

  for (const q of SECURITY_QUESTIONS) {
    if (!draft[q.key].trim()) {
      return `Please answer: "${q.label}"`;
    }
  }
  if (draft.attend_all_days !== 'yes' && draft.attend_all_days !== 'no') {
    return 'Please select whether you can attend all days.';
  }
  if (!draft.issues_note.trim()) {
    return 'Please fill in the final question (write N/A if there are no issues).';
  }
  return null;
}

export function validateCompleteSecurityApplication(
  draft: SecurityApplicationDraft,
  files: readonly FileLike[]
): string | null {
  return (
    validateSecurityStep(1, draft, files) ||
    validateSecurityStep(2, draft, files) ||
    validateSecurityStep(3, draft, files)
  );
}

function escapeCsvFormulaCell(raw: unknown): string {
  const s = String(raw ?? '');
  const trimmedStart = s.trimStart();
  const safe =
    trimmedStart.startsWith('=') ||
    trimmedStart.startsWith('+') ||
    trimmedStart.startsWith('-') ||
    trimmedStart.startsWith('@') ||
    trimmedStart.startsWith('\t') ||
    trimmedStart.startsWith('\r')
      ? `'${s}`
      : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportApplicationsToCsv(rows: readonly Record<string, unknown>[]): string {
  const headers = [
    'track',
    'status',
    'recommendation',
    'full_name',
    'email',
    'school',
    'phone',
    'emergency_contact',
    'gender',
    'grade',
    'attend_all_days',
    'issues_note',
    'experience',
    'why',
    'role_understanding',
    'fight_precautions',
    'rules_enforcement',
    'proof_count',
    'recommendation_note',
    'decision_note',
    'created_at'
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    const proofs = Array.isArray(r.proof_urls) ? r.proof_urls.length : 0;
    const rowObj: Record<string, unknown> = { ...r, proof_count: proofs };
    lines.push(headers.map(h => escapeCsvFormulaCell(rowObj[h])).join(','));
  }
  return lines.join('\n');
}
