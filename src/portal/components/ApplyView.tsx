import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, FileText, Trash2, Upload } from 'lucide-react';
import {
  buildProofStoragePath,
  countWords,
  EMPTY_SECURITY_DRAFT,
  formatFileSize,
  isLikelySchoolAbbreviation,
  MAX_PROOF_FILES,
  SECURITY_QUESTIONS,
  validateCompleteSecurityApplication,
  validateProofFiles,
  validateSecurityStep,
  type SecurityApplicationDraft,
  type SecurityGrade,
  type SecurityProofMeta
} from '../../utils/securityApplicationLogic';
import { PROOFS_BUCKET, sb } from '../supabaseClient';

const DRAFT_STORAGE_KEY = 'veritas_security_application_draft_v1';

interface LocalProofFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

const STEP_LABELS = [
  { n: '01', title: 'Applicant Details' },
  { n: '02', title: 'Experience & Proof' },
  { n: '03', title: 'Security Questions' },
  { n: '04', title: 'Review & Submit' }
] as const;

const GRADE_OPTIONS: readonly SecurityGrade[] = ['10', '11', '12', 'First Year University'];

function makeSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'sec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const ApplyView: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [draft, setDraft] = useState<SecurityApplicationDraft>(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) return { ...EMPTY_SECURITY_DRAFT, ...JSON.parse(saved) };
    } catch {
      // ignore storage failure
    }
    return EMPTY_SECURITY_DRAFT;
  });
  const [files, setFiles] = useState<LocalProofFile[]>([]);
  const [honeypot, setHoneypot] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadPct, setUploadPct] = useState(0);
  const [done, setDone] = useState<{ name: string; email: string; proofCount: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.title = 'Veritas MUN | Apply as Security';
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage failure
    }
  }, [draft]);

  useEffect(() => {
    return () => {
      files.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [files]);

  const setField =
    <K extends keyof SecurityApplicationDraft>(key: K) =>
    (value: SecurityApplicationDraft[K]) => {
      setErr('');
      setDraft(prev => ({ ...prev, [key]: value }));
    };

  const addSelectedFiles = (incomingList: FileList | File[] | null) => {
    if (!incomingList || incomingList.length === 0) return;
    setErr('');
    const incoming = Array.from(incomingList);
    const combined = [...files.map(x => x.file), ...incoming];
    const check = validateProofFiles(combined);
    if (!check.valid) {
      setErr(check.error || 'Unsupported file selection.');
      return;
    }
    const additions: LocalProofFile[] = incoming.map(file => ({
      id: makeSubmissionId(),
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));
    setFiles(prev => [...prev, ...additions]);
  };

  const removeFile = (id: string) => {
    setErr('');
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const goToStep = (next: 1 | 2 | 3 | 4) => {
    setErr('');
    if (next > step) {
      for (let s = step; s < next; s++) {
        const issue = validateSecurityStep(s as 1 | 2 | 3, draft, files.map(f => f.file));
        if (issue) {
          setErr(issue);
          setStep(s as 1 | 2 | 3);
          return;
        }
      }
    }
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetDraft = () => {
    files.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFiles([]);
    setDraft(EMPTY_SECURITY_DRAFT);
    setStep(1);
    setErr('');
    try {
      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    const rawFiles = files.map(f => f.file);
    const fullError = validateCompleteSecurityApplication(draft, rawFiles);
    if (fullError) {
      setErr(fullError);
      return;
    }

    setBusy(true);
    setErr('');
    setUploadPct(5);
    setUploadStatus(`Uploading proof 1 of ${rawFiles.length}...`);

    try {
      const submissionId = makeSubmissionId();
      const uploadedMeta: SecurityProofMeta[] = [];
      for (let i = 0; i < rawFiles.length; i++) {
        const f = rawFiles[i];
        setUploadStatus(`Uploading proof ${i + 1} of ${rawFiles.length}: ${f.name}`);
        const storagePath = buildProofStoragePath(submissionId, i, f.name);
        const { error: upErr } = await sb.storage.from(PROOFS_BUCKET).upload(storagePath, f, {
          cacheControl: '3600',
          upsert: false,
          contentType: f.type || undefined
        });
        if (upErr) {
          throw new Error(`Could not upload "${f.name}": ${upErr.message}`);
        }
        uploadedMeta.push({
          name: f.name,
          path: storagePath,
          size: f.size,
          mimeType: f.type || 'application/octet-stream'
        });
        setUploadPct(Math.round(((i + 1) / rawFiles.length) * 85));
      }

      setUploadStatus('Submitting Security Department application...');
      setUploadPct(92);

      const normalizedEmail = draft.email.trim().toLowerCase();
      const { error: insErr } = await sb.from('applications').insert({
        track: 'Security',
        full_name: draft.full_name.trim(),
        email: normalizedEmail,
        school: draft.school.trim(),
        phone: draft.phone.trim(),
        emergency_contact: draft.emergency_contact.trim(),
        gender: draft.gender,
        grade: draft.grade,
        experience: draft.experience.trim(),
        proof_urls: uploadedMeta,
        why: draft.why.trim(),
        role_understanding: draft.role_understanding.trim(),
        fight_precautions: draft.fight_precautions.trim(),
        rules_enforcement: draft.rules_enforcement.trim(),
        attend_all_days: draft.attend_all_days === 'yes',
        issues_note: draft.issues_note.trim()
      });

      if (insErr) {
        if (insErr.code === '23505') {
          throw new Error('An application with this email for the Security Department has already been submitted.');
        }
        throw new Error(insErr.message || 'Unable to save your application.');
      }

      setUploadPct(100);
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
      setDone({
        name: draft.full_name.trim(),
        email: normalizedEmail,
        proofCount: uploadedMeta.length
      });
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : 'Something went wrong while submitting. Please try again.';
      setErr(msg);
    } finally {
      setBusy(false);
      setUploadStatus('');
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#1A1217] px-4 py-8 text-[#EDE6D6]">
        <header className="mx-auto mb-6 flex max-w-2xl items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 text-[#EDE6D6] no-underline">
            <img src="/logo.png" alt="Veritas MUN" className="h-9 w-9 object-contain" />
            <span className="font-display text-base font-semibold tracking-wider uppercase">Veritas MUN</span>
          </a>
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-[#BAB1A0] hover:text-[#EDE6D6]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Return to site</span>
          </a>
        </header>

        <main className="mx-auto max-w-2xl rounded-[2px] border border-[#1A1217]/20 border-t-4 border-t-[#4F9A57] bg-[#EDE6D6] p-8 text-[#1A1217] shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2F6B34]">Application Received</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-[#1A1217]">Thank you, {done.name}.</h1>
          <p className="mt-3 font-editorial text-xl leading-relaxed text-[#1A1217]/85">
            Your Security Department application and {done.proofCount} proof{' '}
            {done.proofCount === 1 ? 'file' : 'files'} under <strong>{done.email}</strong> have been recorded for review by the Security Head and the Executive Board.
          </p>
          <div className="mt-6">
            <a href="/" className="v-btn v-btn-primary">
              Back to Veritas MUN
            </a>
          </div>
        </main>
      </div>
    );
  }

  const abbrWarning = isLikelySchoolAbbreviation(draft.school);

  return (
    <div className="min-h-screen bg-[#1A1217] px-4 py-7 pb-16 text-[#EDE6D6]">
      <header className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-3 text-[#EDE6D6] no-underline">
          <img
            src="/logo.png"
            alt="Veritas MUN"
            className="h-9 w-9 shrink-0 rounded-full object-cover border border-[#BAB1A0]/40"
          />
          <span className="font-display text-base font-semibold tracking-wider uppercase">Veritas MUN</span>
        </a>
        <a href="/" className="inline-flex items-center gap-1.5 text-sm text-[#BAB1A0] hover:text-[#EDE6D6]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Veritas MUN</span>
        </a>
      </header>

      <form
        onSubmit={submit}
        noValidate
        className="mx-auto max-w-4xl rounded-[2px] border border-[#1A1217]/20 border-t-4 border-t-[#4F9A57] bg-[#EDE6D6] p-6 sm:p-9 text-[#1A1217] shadow-2xl"
      >
        <div className="border-b border-[#1A1217]/15 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2F6B34]">Security Department</p>
          <h1 className="mt-1 font-display text-2xl sm:text-4xl font-semibold text-[#1A1217]">Apply as Security</h1>
          <p className="mt-2 max-w-2xl font-editorial text-lg leading-relaxed text-[#1A1217]/80">
            Complete all four sections below. Your draft stays saved while you type, and uploaded proof documents remain restricted to authorized Security and Executive Board reviewers.
          </p>
        </div>

        <div className="my-6 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Application steps">
          {STEP_LABELS.map((item, idx) => {
            const num = (idx + 1) as 1 | 2 | 3 | 4;
            const current = num === step;
            const completed = num < step;
            return (
              <button
                key={item.n}
                type="button"
                onClick={() => goToStep(num)}
                aria-current={current ? 'step' : undefined}
                className={`rounded-[2px] border px-3 py-2.5 text-left transition ${
                  current
                    ? 'border-[#1A1217] bg-[#1A1217] text-[#EDE6D6]'
                    : completed
                      ? 'border-[#2F6B34]/60 bg-[#FAF6EE] text-[#1A1217]'
                      : 'border-[#1A1217]/15 bg-[#FAF6EE]/70 text-[#1A1217]/65 hover:border-[#1A1217]/35'
                }`}
              >
                <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
                  <span className={current ? 'text-[#4F9A57]' : 'text-[#2F6B34]'}>Step {item.n}</span>
                  {completed ? <Check className="h-3.5 w-3.5 text-[#2F6B34]" aria-hidden="true" /> : null}
                </span>
                <span className="mt-0.5 block text-sm font-semibold leading-tight">{item.title}</span>
              </button>
            );
          })}
        </div>

        {step === 1 && (
          <div className="space-y-4 v-animate-in">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sec-full-name" className="mb-1.5 block text-sm font-semibold text-[#1A1217]">
                  Full name <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
                </label>
                <input
                  id="sec-full-name"
                  required
                  value={draft.full_name}
                  onChange={e => setField('full_name')(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                  className="v-input"
                />
              </div>
              <div>
                <label htmlFor="sec-email" className="mb-1.5 block text-sm font-semibold text-[#1A1217]">
                  Email <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
                </label>
                <input
                  id="sec-email"
                  type="email"
                  required
                  value={draft.email}
                  onChange={e => setField('email')(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="v-input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sec-school" className="mb-1.5 block text-sm font-semibold text-[#1A1217]">
                School Name (No abbreviations) <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
              </label>
              <input
                id="sec-school"
                required
                value={draft.school}
                onChange={e => setField('school')(e.target.value)}
                placeholder="Write your full school or university name"
                className="v-input"
              />
              {abbrWarning && (
                <div role="status" className="mt-2 rounded-[2px] border border-[#8C5A16]/35 bg-[#FAF6EE] px-3 py-2 text-xs font-medium text-[#6B440E]">
                  Please write out your full school name without abbreviations (avoid short acronyms or initials).
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sec-phone" className="mb-1.5 block text-sm font-semibold text-[#1A1217]">
                  Your Number <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
                </label>
                <input
                  id="sec-phone"
                  type="tel"
                  required
                  value={draft.phone}
                  onChange={e => setField('phone')(e.target.value)}
                  placeholder="ex: 05*****"
                  autoComplete="tel"
                  className="v-input tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="sec-emergency" className="mb-1.5 block text-sm font-semibold text-[#1A1217]">
                  Emergency Contact <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
                </label>
                <input
                  id="sec-emergency"
                  required
                  value={draft.emergency_contact}
                  onChange={e => setField('emergency_contact')(e.target.value)}
                  placeholder="ex: 05*****/Mother"
                  className="v-input"
                />
              </div>
            </div>

            <fieldset className="border-0 p-0">
              <legend className="mb-2 text-sm font-semibold text-[#1A1217]">
                Gender <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                {(['Male', 'Female'] as const).map(opt => (
                  <label
                    key={opt}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[2px] border px-3.5 py-2 text-sm transition ${
                      draft.gender === opt
                        ? 'border-[#2F6B34] bg-[#2F6B34]/10 font-semibold text-[#1A1217]'
                        : 'border-[#1A1217]/20 bg-[#FAF6EE] hover:border-[#2F6B34]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="gender"
                      value={opt}
                      checked={draft.gender === opt}
                      onChange={() => setField('gender')(opt)}
                      className="h-4 w-4 accent-[#2F6B34]"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="border-0 p-0">
              <legend className="mb-2 text-sm font-semibold text-[#1A1217]">
                Grade <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {GRADE_OPTIONS.map(opt => (
                  <label
                    key={opt}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[2px] border px-3.5 py-2 text-sm transition ${
                      draft.grade === opt
                        ? 'border-[#2F6B34] bg-[#2F6B34]/10 font-semibold text-[#1A1217]'
                        : 'border-[#1A1217]/20 bg-[#FAF6EE] hover:border-[#2F6B34]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="grade"
                      value={opt}
                      checked={draft.grade === opt}
                      onChange={() => setField('grade')(opt)}
                      className="h-4 w-4 accent-[#2F6B34]"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 v-animate-in">
            <div>
              <label htmlFor="sec-exp" className="mb-1 block text-sm font-semibold text-[#1A1217]">
                Kindly list your previous experiences <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
              </label>
              <p className="mb-2 text-xs text-[#1A1217]/65">ex: ICON MUN/Security/Best Security Member</p>
              <textarea
                id="sec-exp"
                required
                rows={4}
                value={draft.experience}
                onChange={e => setField('experience')(e.target.value)}
                placeholder="ex: ICON MUN/Security/Best Security Member"
                className="v-input min-h-[120px]"
              />
            </div>

            <div>
              <label htmlFor="sec-proof-input" className="mb-1 block text-sm font-semibold text-[#1A1217]">
                Proof of Experiences (Experience will not be counted without proof){' '}
                <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
              </label>
              <p className="mb-2.5 text-xs text-[#1A1217]/65">
                Upload up to 10 supported files. Max 100 MB per file. (JPG, PNG, WEBP, HEIC, PDF, DOC, DOCX)
              </p>

              <div
                className={`rounded-[2px] border border-dashed px-5 py-7 text-center transition ${
                  dragActive
                    ? 'border-[#2F6B34] bg-[#2F6B34]/10'
                    : 'border-[#2F6B34]/55 bg-[#FAF6EE]'
                }`}
                onDragOver={e => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragActive(false);
                  addSelectedFiles(e.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInputRef}
                  id="sec-proof-input"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={e => {
                    addSelectedFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Upload className="mx-auto h-6 w-6 text-[#2F6B34]" aria-hidden="true" />
                <p className="mt-2 text-sm text-[#1A1217]/80">
                  Drag and drop your certificates, badges, or proof screenshots here
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="v-btn v-btn-secondary mt-3"
                >
                  Choose files ({files.length}/{MAX_PROOF_FILES})
                </button>
              </div>

              {files.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {files.map(item => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-2.5 rounded-[2px] border border-[#1A1217]/15 bg-[#FAF6EE] p-3"
                    >
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-28 w-full rounded-[2px] bg-[#EDE6D6] object-cover"
                        />
                      ) : (
                        <div className="flex h-28 items-center justify-center rounded-[2px] bg-[#EDE6D6] text-xs font-semibold uppercase tracking-wider text-[#1A1217]/75">
                          <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {item.file.name.split('.').pop() || 'FILE'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#1A1217]">{item.file.name}</p>
                        <p className="text-xs tabular-nums text-[#1A1217]/60">{formatFileSize(item.file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                        className="v-btn v-btn-danger-outline min-h-[34px] py-1 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 v-animate-in">
            {SECURITY_QUESTIONS.map(q => {
              const val = draft[q.key];
              const wc = countWords(val);
              const met = wc >= q.targetWords;
              return (
                <div key={q.key}>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                    <label htmlFor={`sec-${q.key}`} className="text-sm font-semibold text-[#1A1217]">
                      {q.label} ({q.targetWords} words) <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
                    </label>
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        met ? 'text-[#2F6B34]' : 'text-[#1A1217]/60'
                      }`}
                    >
                      {wc} / {q.targetWords} words
                    </span>
                  </div>
                  <textarea
                    id={`sec-${q.key}`}
                    required
                    rows={4}
                    value={val}
                    onChange={e => setField(q.key)(e.target.value)}
                    placeholder="Write your response here..."
                    className="v-input min-h-[110px]"
                  />
                </div>
              );
            })}

            <fieldset className="border-0 p-0">
              <legend className="mb-2 text-sm font-semibold text-[#1A1217]">
                Will you be able to attend all days ? <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
                {(['yes', 'no'] as const).map(opt => (
                  <label
                    key={opt}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[2px] border px-3.5 py-2 text-sm capitalize transition ${
                      draft.attend_all_days === opt
                        ? 'border-[#2F6B34] bg-[#2F6B34]/10 font-semibold text-[#1A1217]'
                        : 'border-[#1A1217]/20 bg-[#FAF6EE] hover:border-[#2F6B34]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="attend_all_days"
                      value={opt}
                      checked={draft.attend_all_days === opt}
                      onChange={() => setField('attend_all_days')(opt)}
                      className="h-4 w-4 accent-[#2F6B34]"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="sec-issues" className="mb-1.5 block text-sm font-semibold text-[#1A1217]">
                Do you have any issues we should be aware of ? If not write N/A{' '}
                <span className="text-[#8A2B2B]" aria-hidden="true">*</span>
              </label>
              <textarea
                id="sec-issues"
                required
                rows={3}
                value={draft.issues_note}
                onChange={e => setField('issues_note')(e.target.value)}
                placeholder="Write N/A if there are no issues to report."
                className="v-input min-h-[86px]"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5 v-animate-in">
            <div className="grid grid-cols-1 gap-3.5 rounded-[2px] border border-[#1A1217]/15 bg-[#FAF6EE] p-4 sm:grid-cols-2">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">Full name</span>
                <span className="text-sm font-medium text-[#1A1217]">{draft.full_name}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">Email</span>
                <span className="text-sm font-medium text-[#1A1217]">{draft.email.trim().toLowerCase()}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">School Name</span>
                <span className="text-sm font-medium text-[#1A1217]">{draft.school}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">Your Number</span>
                <span className="text-sm font-medium tabular-nums text-[#1A1217]">{draft.phone}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">Emergency Contact</span>
                <span className="text-sm font-medium text-[#1A1217]">{draft.emergency_contact}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">Gender &amp; Grade</span>
                <span className="text-sm font-medium text-[#1A1217]">
                  {draft.gender} · Grade {draft.grade}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">Attend all days?</span>
                <span className="text-sm font-medium capitalize text-[#1A1217]">{draft.attend_all_days}</span>
              </div>
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">Proof files attached</span>
                <span className="text-sm font-medium tabular-nums text-[#1A1217]">{files.length} file(s)</span>
              </div>
            </div>

            <div className="space-y-3 rounded-[2px] border border-[#1A1217]/15 bg-[#FAF6EE] p-4">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">
                  Previous Experiences
                </span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#1A1217]">{draft.experience}</p>
              </div>
              {SECURITY_QUESTIONS.map(q => (
                <div key={q.key} className="border-t border-[#1A1217]/10 pt-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">
                    {q.label} ({countWords(draft[q.key])} words)
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#1A1217]">{draft[q.key]}</p>
                </div>
              ))}
              <div className="border-t border-[#1A1217]/10 pt-3">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">
                  Issues we should be aware of
                </span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#1A1217]">{draft.issues_note}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => goToStep(1)} className="v-btn v-btn-secondary">
                Edit Details
              </button>
              <button type="button" onClick={() => goToStep(2)} className="v-btn v-btn-secondary">
                Edit Proof
              </button>
              <button type="button" onClick={() => goToStep(3)} className="v-btn v-btn-secondary">
                Edit Questions
              </button>
            </div>
          </div>
        )}

        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
          className="absolute -left-[9999px]"
          aria-hidden="true"
        />

        {err && (
          <div
            role="alert"
            className="mt-5 rounded-[2px] border border-[#8A2B2B]/40 bg-[#FAF6EE] px-4 py-3 text-sm font-medium text-[#741F1F]"
          >
            {err}
          </div>
        )}

        {busy && (
          <div role="status" className="mt-4">
            <p className="text-xs font-medium text-[#1A1217]/80">{uploadStatus || 'Submitting...'}</p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[1px] bg-[#1A1217]/15">
              <div className="h-full bg-[#2F6B34] transition-all duration-200" style={{ width: `${uploadPct}%` }} />
            </div>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#1A1217]/15 pt-5">
          {step > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => goToStep((step - 1) as 1 | 2 | 3 | 4)}
              className="v-btn v-btn-secondary"
            >
              Previous
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={resetDraft} className="v-btn v-btn-secondary">
              Clear draft
            </button>
          )}

          {step < 4 ? (
            <button type="button" onClick={() => goToStep((step + 1) as 2 | 3 | 4)} className="v-btn v-btn-primary">
              Continue
            </button>
          ) : (
            <button type="submit" disabled={busy} className="v-btn v-btn-primary">
              {busy ? 'Submitting...' : 'Submit Application'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
