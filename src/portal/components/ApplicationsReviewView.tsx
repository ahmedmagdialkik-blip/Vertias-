import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  Download,
  FileText,
  History,
  Lock,
  Mail,
  Send,
  ShieldAlert,
  UserPlus,
  Users
} from 'lucide-react';
import { countWords, exportApplicationsToCsv } from '../../utils/securityApplicationLogic';
import { formatVolunteerFileSize } from '../../utils/volunteerApplicationLogic';
import {
  buildGmailComposeUrl,
  canIssueApplicantInvite,
  interpolateEmailTemplate,
  validateApplicationOverrideReason
} from '../../utils/managementLogic';
import { invokeEdgeFunction } from './invokeEdgeFunction';

const PROOFS_BUCKET = 'application-proofs';

interface SignedProof {
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
  isImage: boolean;
}

function isImageProof(name: string, mime?: string) {
  if (mime && mime.toLowerCase().startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name);
}

interface ApplicationsReviewViewProps {
  sb: any;
  me: any;
  canIssueHrInvite?: boolean;
  onNavigateTab?: (tabId: string) => void;
}

const AppDossierCard: React.FC<{
  sb: any;
  a: any;
  me: any;
  canIssueHrInvite: boolean;
  templates: Record<string, { subject: string; body_text: string }>;
  onNavigateTab?: (tabId: string) => void;
  reload: () => Promise<void>;
}> = ({ sb, a, me, canIssueHrInvite, templates, onNavigateTab, reload }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [proofs, setProofs] = useState<SignedProof[]>([]);
  const [proofLoading, setProofLoading] = useState(false);
  const [lightbox, setLightbox] = useState<SignedProof | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [confNotes, setConfNotes] = useState({
    medical_notes: '',
    welfare_flags: '',
    internal_notes: ''
  });
  const [confSaving, setConfSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);

  const isAdmin = me.role === 'admin';
  const proofCount = Array.isArray(a.proof_urls) ? a.proof_urls.length : 0;

  const loadSignedProofs = useCallback(async () => {
    const rawList = Array.isArray(a.proof_urls) ? a.proof_urls : [];
    if (!rawList.length) {
      setProofs([]);
      return;
    }
    setProofLoading(true);
    const out: SignedProof[] = [];
    for (const item of rawList) {
      const path = typeof item === 'string' ? item : item?.path;
      const name = typeof item === 'string' ? path?.split('/').pop() || 'Proof' : item?.name || 'Proof';
      const mimeType = typeof item === 'object' ? item?.mimeType : '';
      const size = typeof item === 'object' ? item?.size : undefined;
      if (!path) continue;
      const { data } = await sb.storage.from(PROOFS_BUCKET).createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        out.push({ name, url: data.signedUrl, size, mimeType, isImage: isImageProof(name, mimeType) });
      }
    }
    setProofs(out);
    setProofLoading(false);
  }, [sb, a.proof_urls]);

  const loadDetails = useCallback(async () => {
    const reqs: Promise<any>[] = [
      sb
        .from('application_decision_history')
        .select('*')
        .eq('application_id', a.id)
        .order('created_at', { ascending: false })
    ];
    if (isAdmin) {
      reqs.push(
        sb
          .from('application_confidential_notes')
          .select('*')
          .eq('application_id', a.id)
          .maybeSingle()
      );
    }
    const [histRes, confRes] = await Promise.all(reqs);
    if (!histRes.error) setHistory(histRes.data || []);
    if (confRes && !confRes.error && confRes.data) {
      setConfNotes({
        medical_notes: confRes.data.medical_notes || '',
        welfare_flags: confRes.data.welfare_flags || '',
        internal_notes: confRes.data.internal_notes || ''
      });
    }
  }, [sb, a.id, isAdmin]);

  useEffect(() => {
    if (open) {
      void loadSignedProofs();
      void loadDetails();
    }
  }, [open, loadSignedProofs, loadDetails]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const callRecommend = async (rec: 'accept' | 'reject') => {
    setErr('');
    setMsg('');
    const { error } = await sb.rpc('recommend_application', { app_id: a.id, rec, note });
    if (error) {
      setErr(error.message || 'Could not record recommendation.');
      return;
    }
    setNote('');
    setMsg(`Recommendation (${rec}) recorded.`);
    await reload();
    await loadDetails();
  };

  const callDecide = async (decision: 'accepted' | 'rejected' | 'waitlisted' | 'pending') => {
    setErr('');
    setMsg('');
    const overrideErr = validateApplicationOverrideReason(
      Boolean(a.decision_locked),
      String(a.status || 'pending'),
      decision,
      overrideReason
    );
    if (overrideErr) {
      setErr(overrideErr);
      return;
    }

    const { error } = await sb.rpc('decide_application', {
      app_id: a.id,
      decision,
      note,
      override_reason: overrideReason.trim()
    });
    if (error) {
      setErr(error.message || 'Could not save decision.');
      return;
    }
    setNote('');
    setOverrideReason('');
    setMsg(`Final decision updated to ${decision}.`);
    await reload();
    await loadDetails();
  };

  const saveConfidentialNotes = async () => {
    setErr('');
    setMsg('');
    setConfSaving(true);
    try {
      const { error } = await sb.from('application_confidential_notes').upsert(
        {
          application_id: a.id,
          medical_notes: confNotes.medical_notes.trim(),
          welfare_flags: confNotes.welfare_flags.trim(),
          internal_notes: confNotes.internal_notes.trim(),
          updated_by: me.id
        },
        { onConflict: 'application_id' }
      );
      if (error) {
        setErr(error.message || 'Could not save confidential notes.');
        return;
      }
      setMsg('Confidential EB notes saved securely.');
    } finally {
      setConfSaving(false);
    }
  };

  const handleIssueInvite = async () => {
    setErr('');
    setMsg('');
    const check = canIssueApplicantInvite(a);
    if (!check.ok) {
      setErr(check.reason || 'Cannot invite this applicant.');
      return;
    }
    setInviteBusy(true);
    try {
      const { data, error } = await invokeEdgeFunction<{
        ok?: boolean;
        created?: Array<{ invite_url: string }>;
        skipped?: Array<{ reason: string }>;
      }>(sb, 'veritas-invites', {
        action: 'create_applicant_invites',
        application_id: a.id
      });
      if (error || !data?.created?.length) {
        setErr(error || data?.skipped?.[0]?.reason || 'Could not issue personal invite.');
        return;
      }
      setInviteUrl(data.created[0].invite_url);
      setMsg('Personal onboarding link created (non-expiring, single-use).');
    } finally {
      setInviteBusy(false);
    }
  };

  const tplKey =
    a.status === 'accepted'
      ? 'application_accepted'
      : a.status === 'waitlisted'
        ? 'application_waitlisted'
        : 'application_rejected';
  const tpl = templates[tplKey] || {
    subject: `Veritas MUN — ${a.track || 'Department'} Application Update`,
    body_text: `Dear {{full_name}},\n\nYour application status is: ${a.status}.\n\n{{note}}`
  };
  const gmailHref = buildGmailComposeUrl({
    to: a.email || '',
    subject: interpolateEmailTemplate(tpl.subject, {
      full_name: a.full_name,
      department: a.track || 'Department',
      email: a.email,
      note: a.decision_note || ''
    }),
    body: interpolateEmailTemplate(tpl.body_text, {
      full_name: a.full_name,
      department: a.track || 'Department',
      email: a.email,
      note: a.decision_note || ''
    })
  });

  const statusBadgeCls =
    a.status === 'accepted' ? 'tag g' : a.status === 'rejected' ? 'tag r' : 'tag';

  return (
    <div className="card application-card">
      <div className="toolbar" style={{ margin: 0, justifyContent: 'space-between' }}>
        <div className="toolbar" style={{ margin: 0 }}>
          <b style={{ fontSize: '1.2rem' }}>{a.full_name}</b>
          <span className="tag">{a.track || 'Security'}</span>
          <span className={statusBadgeCls}>{a.status}</span>
          {a.decision_locked && (
            <span className="tag" title="Decision is locked; changes require an Executive Board override justification">
              <Lock size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
              Locked
            </span>
          )}
          {a.recommendation && (
            <span className={'tag ' + (a.recommendation === 'accept' ? 'g' : 'r')}>
              Head recommends {a.recommendation}
            </span>
          )}
          {a.attend_all_days === false && <span className="tag r">Cannot attend all days</span>}
          {proofCount > 0 && (
            <span className="tag">
              {proofCount} proof{proofCount === 1 ? '' : 's'}
            </span>
          )}
          {a.email_status && <span className="tag g">Email: {a.email_status}</span>}
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <span style={{ opacity: 0.7, fontSize: '.9rem' }}>
            {new Date(a.created_at).toLocaleDateString()}
          </span>
          <button type="button" className="btn ghost" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Open'}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div className="dossier-grid">
            <div><span className="review-k">Email</span>{a.email}</div>
            <div><span className="review-k">Phone Number</span>{a.phone || '-'}</div>
            <div><span className="review-k">Emergency Contact</span>{a.emergency_contact || '-'}</div>
            <div><span className="review-k">School Name</span>{a.school || '-'}</div>
            <div><span className="review-k">Gender &amp; Grade</span>{a.gender || '-'}{a.grade ? ` · Grade ${a.grade}` : ''}</div>
            <div><span className="review-k">Attend all days?</span>{a.attend_all_days === false ? 'No' : 'Yes'}</div>
          </div>

          {a.experience && (
            <div className="dossier-q">
              <b>Previous Experiences</b>
              <div className="review-v">{a.experience}</div>
            </div>
          )}

          <div className="dossier-q">
            <b>Proof of Experiences ({proofCount})</b>
            {proofLoading && <p style={{ margin: '6px 0' }}>Loading secure previews...</p>}
            {!proofLoading && proofs.length === 0 && (
              <p style={{ margin: '6px 0', opacity: 0.75 }}>No proof files attached.</p>
            )}
            {proofs.length > 0 && (
              <div className="proof-grid">
                {proofs.map((p, idx) => (
                  <div className="proof-item" key={p.name + idx}>
                    {p.isImage ? (
                      <img
                        className="proof-thumb"
                        src={p.url}
                        alt={p.name}
                        style={{ cursor: 'zoom-in' }}
                        onClick={() => setLightbox(p)}
                      />
                    ) : (
                      <div className="proof-doc">{p.name.split('.').pop()?.toUpperCase() || 'FILE'}</div>
                    )}
                    <div className="proof-meta">
                      <strong>{p.name}</strong>
                      {p.size ? <div style={{ opacity: 0.72 }}>{formatVolunteerFileSize(p.size)}</div> : null}
                    </div>
                    <div className="toolbar" style={{ margin: 0 }}>
                      {p.isImage && (
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: '5px 10px', minHeight: 34 }}
                          onClick={() => setLightbox(p)}
                        >
                          Zoom
                        </button>
                      )}
                      <a className="btn ghost" style={{ padding: '5px 10px', minHeight: 34 }} href={p.url} target="_blank" rel="noopener noreferrer">
                        Open
                      </a>
                      <a className="btn ghost" style={{ padding: '5px 10px', minHeight: 34 }} href={p.url} download={p.name} rel="noopener noreferrer">
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(() => {
            const isVol = /^volunteer/i.test(String(a.track || ''));
            return (
              <>
                {a.why && (
                  <div className="dossier-q">
                    <b>{isVol ? 'Why Volunteer Department?' : 'Why Security?'} ({countWords(a.why)} words)</b>
                    <div className="review-v">{a.why}</div>
                  </div>
                )}
                {a.role_understanding && (
                  <div className="dossier-q">
                    <b>{isVol ? 'Role of a Volunteer at MUN' : 'Role of Security at MUN'} ({countWords(a.role_understanding)} words)</b>
                    <div className="review-v">{a.role_understanding}</div>
                  </div>
                )}
                {a.wandering_action && (
                  <div className="dossier-q">
                    <b>Action When Another Volunteer Wanders ({countWords(a.wandering_action)} words)</b>
                    <div className="review-v">{a.wandering_action}</div>
                  </div>
                )}
                {a.fight_precautions && (
                  <div className="dossier-q">
                    <b>Delegate Fight Precautions ({countWords(a.fight_precautions)} words)</b>
                    <div className="review-v">{a.fight_precautions}</div>
                  </div>
                )}
                {a.rules_enforcement && (
                  <div className="dossier-q">
                    <b>Ensuring Rules Enforcement ({countWords(a.rules_enforcement)} words)</b>
                    <div className="review-v">{a.rules_enforcement}</div>
                  </div>
                )}
                {a.issues_note && (
                  <div className="dossier-q">
                    <b>Applicant Health / Scheduling Issues Reported</b>
                    <div className="review-v">{a.issues_note}</div>
                  </div>
                )}
              </>
            );
          })()}

          {a.recommendation_note && (
            <p><i>Head&apos;s note: {a.recommendation_note}</i></p>
          )}
          {a.decision_note && (
            <p><i>Decision note: {a.decision_note}</i></p>
          )}
          {a.last_override_reason && (
            <p style={{ color: '#6B1F1F' }}>
              <strong>Last Override Justification:</strong> {a.last_override_reason}
            </p>
          )}

          {isAdmin && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background: '#FBF3F1',
                border: '1px solid #C5A19A',
                borderRadius: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ShieldAlert size={16} color="#6B1F1F" />
                <strong style={{ fontFamily: 'Cinzel, serif', fontSize: 13 }}>
                  Confidential Medical &amp; Welfare Notes (Admins Only)
                </strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`med-${a.id}`}>Medical / Dietary Notes</label>
                  <textarea
                    id={`med-${a.id}`}
                    value={confNotes.medical_notes}
                    onChange={e => setConfNotes(p => ({ ...p, medical_notes: e.target.value }))}
                    placeholder="Private allergies, medical accommodations..."
                    style={{ minHeight: 68 }}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`wel-${a.id}`}>Welfare / Conduct Flags</label>
                  <textarea
                    id={`wel-${a.id}`}
                    value={confNotes.welfare_flags}
                    onChange={e => setConfNotes(p => ({ ...p, welfare_flags: e.target.value }))}
                    placeholder="Safeguarding or scheduling alerts..."
                    style={{ minHeight: 68 }}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`int-${a.id}`}>Executive Internal Notes</label>
                  <textarea
                    id={`int-${a.id}`}
                    value={confNotes.internal_notes}
                    onChange={e => setConfNotes(p => ({ ...p, internal_notes: e.target.value }))}
                    placeholder="EB deliberation notes..."
                    style={{ minHeight: 68 }}
                  />
                </div>
              </div>
              <div className="toolbar" style={{ margin: '10px 0 0' }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={confSaving}
                  onClick={() => void saveConfidentialNotes()}
                >
                  {confSaving ? 'Saving notes...' : 'Save confidential notes'}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <textarea
              placeholder="Reviewer / Decision note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
              aria-label="Reviewer note"
            />
            {isAdmin && a.decision_locked && (
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label htmlFor={`ovr-${a.id}`}>
                  Override justification (required when changing a locked decision)
                </label>
                <input
                  id={`ovr-${a.id}`}
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="Required min 5 chars explaining why a locked decision is being modified..."
                />
              </div>
            )}

            <div className="toolbar">
              {a.status === 'pending' && (
                <>
                  <button type="button" className="btn" onClick={() => void callRecommend('accept')}>
                    Recommend accept
                  </button>
                  <button type="button" className="btn red" onClick={() => void callRecommend('reject')}>
                    Recommend reject
                  </button>
                </>
              )}
              {isAdmin && (
                <>
                  <span style={{ opacity: 0.7 }}>Final decision:</span>
                  <button type="button" className="btn" onClick={() => void callDecide('accepted')}>
                    Accept
                  </button>
                  <button type="button" className="btn ghost" onClick={() => void callDecide('waitlisted')}>
                    Waitlist
                  </button>
                  <button type="button" className="btn red" onClick={() => void callDecide('rejected')}>
                    Reject
                  </button>
                  {a.status !== 'pending' && (
                    <button type="button" className="btn ghost" onClick={() => void callDecide('pending')}>
                      Reopen
                    </button>
                  )}
                </>
              )}
            </div>

            {(canIssueHrInvite || isAdmin) && (
              <div className="toolbar" style={{ marginTop: 6 }}>
                {a.status === 'accepted' && canIssueHrInvite && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={inviteBusy}
                    onClick={() => void handleIssueInvite()}
                  >
                    <UserPlus size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    {inviteBusy ? 'Issuing invite...' : 'Issue HR Onboarding Invite'}
                  </button>
                )}
                <a
                  className="btn ghost"
                  href={gmailHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Mail size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Open in Gmail
                </a>
                {onNavigateTab && isAdmin && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => onNavigateTab('email_center')}
                  >
                    <Send size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    Email Center
                  </button>
                )}
              </div>
            )}

            {inviteUrl && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: '#E6EDE2',
                  border: '1px solid #9CAF91',
                  borderRadius: 6,
                  fontSize: 13
                }}
              >
                <strong>Personal Onboarding Link:</strong>{' '}
                <code style={{ wordBreak: 'break-all' }}>{inviteUrl}</code>
              </div>
            )}

            {msg && <div className="msg" role="status">{msg}</div>}
            {err && <div className="err" role="alert">{err}</div>}
          </div>

          {history.length > 0 && (
            <div className="dossier-q">
              <b>Decision Audit Timeline ({history.length})</b>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {history.map(h => (
                  <div
                    key={h.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      fontSize: 13,
                      padding: '6px 10px',
                      background: h.is_override ? '#FBF3F1' : '#FAF6EE',
                      border: '1px solid #D2C9BB',
                      borderRadius: 6
                    }}
                  >
                    <span>
                      <strong>{h.action}</strong> ({h.previous_status || '-'} &rarr; {h.new_status || '-'})
                      {h.note ? ` — "${h.note}"` : ''}
                      {h.actor_email ? ` · by ${h.actor_email}` : ''}
                    </span>
                    <span style={{ opacity: 0.72, whiteSpace: 'nowrap' }}>
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={() => setLightbox(null)}>
          <img src={lightbox.url} alt={lightbox.name} onClick={e => e.stopPropagation()} />
          <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
            <span>{lightbox.name}</span>
            <a className="btn ghost" style={{ color: '#EDE6D6', borderColor: '#EDE6D6' }} href={lightbox.url} target="_blank" rel="noopener noreferrer">
              Open original
            </a>
            <a className="btn ghost" style={{ color: '#EDE6D6', borderColor: '#EDE6D6' }} href={lightbox.url} download={lightbox.name} rel="noopener noreferrer">
              Download
            </a>
            <button type="button" className="btn" onClick={() => setLightbox(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ApplicationsReviewView: React.FC<ApplicationsReviewViewProps> = ({
  sb,
  me,
  canIssueHrInvite = false,
  onNavigateTab
}) => {
  const [rows, setRows] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Record<string, { subject: string; body_text: string }>>({});
  const [q, setQ] = useState('');
  const [st, setSt] = useState('pending');
  const [tr, setTr] = useState('all');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [appsRes, tplRes] = await Promise.all([
      sb.from('applications').select('*').order('created_at', { ascending: false }),
      sb.from('email_templates').select('template_key, subject, body_text')
    ]);
    setErr(appsRes.error ? appsRes.error.message : '');
    setRows(appsRes.data || []);
    if (!tplRes.error && Array.isArray(tplRes.data)) {
      const map: Record<string, { subject: string; body_text: string }> = {};
      for (const t of tplRes.data) {
        map[t.template_key] = { subject: t.subject, body_text: t.body_text };
      }
      setTemplates(map);
    }
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const headTrack = /security/i.test(String(me.department || ''))
    ? 'Security'
    : /volunteer/i.test(String(me.department || ''))
      ? 'Volunteers'
      : '';
  const deptRows = me.role === 'head' ? rows.filter(r => r.track === headTrack) : rows;
  const shown = deptRows.filter(
    r =>
      (st === 'all' || r.status === st) &&
      (tr === 'all' || r.track === tr) &&
      (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
  );

  const counts = {
    total: deptRows.length,
    pending: deptRows.filter(r => r.status === 'pending').length,
    accepted: deptRows.filter(r => r.status === 'accepted').length,
    waitlisted: deptRows.filter(r => r.status === 'waitlisted').length,
    rejected: deptRows.filter(r => r.status === 'rejected').length
  };

  const handleExportCsv = () => {
    const csv = exportApplicationsToCsv(shown);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `veritas-applications-${st}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">
            {me.role === 'admin' ? 'OPERATIONS / EXECUTIVE REVIEW' : 'DEPARTMENT REVIEW / RECOMMENDATIONS'}
          </p>
          <h1>Applications</h1>
          <p>
            {me.role === 'admin'
              ? 'Review department recommendations, manage confidential EB notes, inspect decision audit history, and record final locked Executive Board decisions.'
              : 'Review applications for your department and record a recommendation. The Executive Board records the final decision.'}
          </p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button type="button" className="btn ghost" onClick={handleExportCsv} disabled={!shown.length}>
            <Download size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Export CSV
          </button>
          <button type="button" className="btn ghost" onClick={() => void load()}>
            Refresh applications
          </button>
        </div>
      </div>

      <div className="admin-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Total</span>
            <FileText className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{counts.total}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Pending</span>
            <ClipboardList className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{counts.pending}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Accepted</span>
            <Users className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{counts.accepted}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Waitlisted</span>
            <History className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{counts.waitlisted}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Rejected</span>
            <History className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{counts.rejected}</strong>
        </div>
      </div>

      <div className="admin-filter-panel">
        <div className="admin-filter-heading">
          <span className="admin-kicker">APPLICATION DIRECTORY</span>
          <span className="admin-filter-count">
            Showing {shown.length} of {deptRows.length}
          </span>
        </div>
        <div className={'admin-filter-grid' + (me.role === 'admin' ? ' admin-filter-grid-wide' : '')}>
          <input
            placeholder="Search name, school, email..."
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search applications"
          />
          <select value={st} onChange={e => setSt(e.target.value)} aria-label="Status">
            <option value="pending">Pending applications</option>
            <option value="accepted">Accepted</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="rejected">Rejected</option>
            <option value="all">All statuses</option>
          </select>
          {me.role === 'admin' && (
            <select value={tr} onChange={e => setTr(e.target.value)} aria-label="Department">
              <option value="all">All departments</option>
              <option value="Volunteers">Volunteers</option>
              <option value="Security">Security</option>
            </select>
          )}
        </div>
        <div className="admin-toolbar-actions">
          <button type="button" className="btn ghost" onClick={() => void load()}>
            Refresh
          </button>
          {err && (
            <span className="err" role="alert">
              {err}
            </span>
          )}
        </div>
      </div>

      {shown.length ? (
        shown.map(a => (
          <AppDossierCard
            key={`${a.id}-${a.status}-${String(a.recommendation)}-${String(a.decision_locked)}`}
            sb={sb}
            a={a}
            me={me}
            canIssueHrInvite={canIssueHrInvite}
            templates={templates}
            onNavigateTab={onNavigateTab}
            reload={load}
          />
        ))
      ) : (
        <div className="admin-empty-state">
          <FileText size={25} strokeWidth={1.6} />
          <strong>{err ? 'Applications could not be loaded' : 'No applications found'}</strong>
          <p>
            {err
              ? 'Check the database connection and access permissions, then refresh.'
              : 'Applications that match your current filters will appear here.'}
          </p>
        </div>
      )}
    </div>
  );
};
