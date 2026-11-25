import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  RefreshCw,
  RotateCcw,
  Search,
  X,
  XCircle,
  ZoomIn
} from 'lucide-react';
import {
  filterAndSortApplications,
  formatDateTime,
  formatShortDate,
  type ApplicationSortKey
} from '../../utils/portalAdminLogic';
import {
  countWords,
  exportApplicationsToCsv,
  formatFileSize
} from '../../utils/securityApplicationLogic';
import {
  PROOFS_BUCKET,
  recordPortalAuditLog,
  sb,
  type PortalApplication,
  type PortalProfile
} from '../supabaseClient';
import { ConfirmModal } from './ConfirmModal';

interface SignedProof {
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
  isImage: boolean;
}

function isImageProof(name: string, mime?: string): boolean {
  if (mime && mime.toLowerCase().startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name);
}

interface ApplicationsViewProps {
  me: PortalProfile;
  applications: PortalApplication[];
  loading: boolean;
  error: string;
  fixedTrack?: 'Security' | 'Volunteers';
  globalSearch?: string;
  initialSelectedId?: string | null;
  onClearInitialSelected?: () => void;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

interface PendingDecisionAction {
  kind: 'recommend' | 'decide';
  app: PortalApplication;
  value: 'accept' | 'reject' | 'accepted' | 'rejected' | 'pending';
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  me,
  applications,
  loading,
  error,
  fixedTrack,
  globalSearch = '',
  initialSelectedId,
  onClearInitialSelected,
  onRefresh,
  onToast
}) => {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('pending');
  const [trackFilter, setTrackFilter] = useState<'all' | 'Security' | 'Volunteers'>(fixedTrack ?? 'all');
  const [availFilter, setAvailFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [sortBy, setSortBy] = useState<ApplicationSortKey>('newest');

  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [proofs, setProofs] = useState<SignedProof[]>([]);
  const [proofLoading, setProofLoading] = useState(false);
  const [lightbox, setLightbox] = useState<SignedProof | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingDecisionAction | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    setTrackFilter(fixedTrack ?? 'all');
  }, [fixedTrack]);

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      setStatusFilter('all');
      onClearInitialSelected?.();
    }
  }, [initialSelectedId, onClearInitialSelected]);

  const effectiveQuery = (query || globalSearch).trim();

  const filteredRows = useMemo(
    () =>
      filterAndSortApplications(applications, {
        track: fixedTrack ?? trackFilter,
        status: statusFilter,
        availability: availFilter,
        query: effectiveQuery,
        sortBy
      }),
    [applications, fixedTrack, trackFilter, statusFilter, availFilter, effectiveQuery, sortBy]
  );

  const selectedApp = useMemo(
    () => applications.find(a => a.id === selectedId) ?? null,
    [applications, selectedId]
  );

  const loadSignedProofs = useCallback(async (app: PortalApplication) => {
    const rawList = Array.isArray(app.proof_urls) ? app.proof_urls : [];
    if (rawList.length === 0) {
      setProofs([]);
      return;
    }
    setProofLoading(true);
    try {
      const out: SignedProof[] = [];
      for (const item of rawList) {
        const path = typeof item === 'string' ? item : item?.path;
        const name = typeof item === 'string' ? path?.split('/').pop() || 'Proof' : item?.name || 'Proof';
        const mimeType = typeof item === 'object' ? item?.mimeType : '';
        const size = typeof item === 'object' ? item?.size : undefined;
        if (!path) continue;
        const { data } = await sb.storage.from(PROOFS_BUCKET).createSignedUrl(path, 3600);
        if (data?.signedUrl) {
          out.push({
            name,
            url: data.signedUrl,
            size,
            mimeType,
            isImage: isImageProof(name, mimeType)
          });
        }
      }
      setProofs(out);
    } finally {
      setProofLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedApp) {
      setReviewerNote('');
      loadSignedProofs(selectedApp);
    } else {
      setProofs([]);
    }
  }, [selectedApp, loadSignedProofs]);

  useEffect(() => {
    if (!lightbox && !selectedApp) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (!pendingAction) setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, selectedApp, pendingAction]);

  const executeConfirmedAction = async () => {
    if (!pendingAction) return;
    setSubmittingAction(true);
    try {
      const { kind, app, value } = pendingAction;
      if (kind === 'recommend') {
        const { error: rpcErr } = await sb.rpc('recommend_application', {
          app_id: app.id,
          rec: value,
          note: reviewerNote
        });
        if (rpcErr) {
          onToast('error', rpcErr.message || 'Could not save recommendation.');
          return;
        }
        if (me.role === 'admin') {
          await recordPortalAuditLog(me.id, me.email, 'application.recommend', {
            app_id: app.id,
            applicant: app.full_name,
            recommendation: value
          });
        }
        onToast('success', `Recorded "${value}" recommendation for ${app.full_name}.`);
      } else {
        const { error: rpcErr } = await sb.rpc('decide_application', {
          app_id: app.id,
          decision: value,
          note: reviewerNote
        });
        if (rpcErr) {
          onToast('error', rpcErr.message || 'Could not record final decision.');
          return;
        }
        await recordPortalAuditLog(me.id, me.email, 'application.decision', {
          app_id: app.id,
          applicant: app.full_name,
          decision: value
        });
        onToast('success', `${app.full_name} marked ${value}.`);
      }
      setReviewerNote('');
      setPendingAction(null);
      await onRefresh();
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportApplicationsToCsv(filteredRows as unknown as Array<Record<string, unknown>>);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const prefix = (fixedTrack || trackFilter || 'all').toLowerCase();
    a.download = `veritas-${prefix}-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isAdmin = me.role === 'admin';
  const headingTitle =
    fixedTrack === 'Security'
      ? 'Security Department Applications'
      : fixedTrack === 'Volunteers'
        ? 'Volunteer Department Applications'
        : 'All Applications';

  return (
    <div className="space-y-5 v-animate-in">
      {/* Header & Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1A1217]/14 pb-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#1A1217]">{headingTitle}</h2>
          <p className="mt-1 text-sm text-[#1A1217]/70">
            {isAdmin
              ? 'Inspect applicant answers, verify uploaded proof documents, and record Executive Board decisions.'
              : 'Review submitted department applications and submit recommendations for Executive Board approval.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onRefresh()} className="v-btn v-btn-secondary">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="v-btn v-btn-secondary"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-3.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/45" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search applications"
            placeholder="Search applicant name, email, or school..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="v-input pl-9"
          />
        </div>

        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'pending' | 'accepted' | 'rejected')}
          className="v-input w-auto min-w-[140px]"
        >
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="all">All Statuses</option>
        </select>

        {!fixedTrack && isAdmin && (
          <select
            aria-label="Filter by department track"
            value={trackFilter}
            onChange={e => setTrackFilter(e.target.value as 'all' | 'Security' | 'Volunteers')}
            className="v-input w-auto min-w-[145px]"
          >
            <option value="all">All Teams</option>
            <option value="Security">Security</option>
            <option value="Volunteers">Volunteers</option>
          </select>
        )}

        <select
          aria-label="Filter by full conference availability"
          value={availFilter}
          onChange={e => setAvailFilter(e.target.value as 'all' | 'yes' | 'no')}
          className="v-input w-auto min-w-[165px]"
        >
          <option value="all">All Availability</option>
          <option value="yes">Attends All Days</option>
          <option value="no">Partial Availability</option>
        </select>

        <select
          aria-label="Sort applications"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as ApplicationSortKey)}
          className="v-input w-auto min-w-[145px]"
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="name">Sort: Name</option>
          <option value="status">Sort: Status</option>
        </select>

        <span className="ml-auto text-xs font-medium tabular-nums text-[#1A1217]/65">
          {filteredRows.length} {filteredRows.length === 1 ? 'application' : 'applications'}
        </span>
      </div>

      {error && (
        <div role="alert" className="rounded-[2px] border border-[#8A2B2B]/40 bg-[#FAF6EE] px-4 py-3 text-sm text-[#741F1F]">
          {error}
        </div>
      )}

      {/* Sortable Data Table */}
      <div className="overflow-x-auto rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE]">
        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="h-11 w-full animate-pulse rounded-[2px] bg-[#EDE6D6]" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-editorial text-xl italic text-[#1A1217]/75">
              No applications match the active filters.
            </p>
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setQuery('');
                  setAvailFilter('all');
                }}
                className="v-btn v-btn-secondary mt-3"
              >
                Show all statuses
              </button>
            )}
          </div>
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1A1217]/12 bg-[#F4EFE4] text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/70">
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">School &amp; Grade</th>
                {!fixedTrack && <th className="px-4 py-3">Track</th>}
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Proofs</th>
                <th className="px-4 py-3">Head Rec.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3 text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1217]/10 text-sm">
              {filteredRows.map(app => {
                const proofCount = Array.isArray(app.proof_urls) ? app.proof_urls.length : 0;
                const isSelected = app.id === selectedId;
                return (
                  <tr
                    key={app.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-[#2F6B34]/8' : 'hover:bg-[#EDE6D6]/45'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1A1217]">{app.full_name}</p>
                      <p className="text-xs text-[#1A1217]/60">{app.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#1A1217] max-w-[210px] truncate">{app.school || '—'}</p>
                      <p className="text-xs text-[#1A1217]/60">
                        {app.grade ? `Grade ${app.grade}` : '—'}
                        {app.gender ? ` · ${app.gender}` : ''}
                      </p>
                    </td>
                    {!fixedTrack && (
                      <td className="px-4 py-3 text-xs font-medium text-[#1A1217]/80">
                        {app.track || 'Security'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs">
                      {app.attend_all_days === false ? (
                        <span className="font-semibold text-[#8A2B2B]">Partial days</span>
                      ) : (
                        <span className="text-[#2F6B34] font-medium">All days</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-[#1A1217]/75">
                      {proofCount} {proofCount === 1 ? 'file' : 'files'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {app.recommendation ? (
                        <span
                          className={`v-status ${
                            app.recommendation === 'accept' ? 'v-status-accepted' : 'v-status-rejected'
                          }`}
                        >
                          {app.recommendation}
                        </span>
                      ) : (
                        <span className="text-[#1A1217]/45">None yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`v-status ${
                          app.status === 'accepted'
                            ? 'v-status-accepted'
                            : app.status === 'rejected'
                              ? 'v-status-rejected'
                              : 'v-status-pending'
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-[#1A1217]/70 whitespace-nowrap">
                      {formatShortDate(app.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedId(app.id)}
                        className="v-btn v-btn-secondary min-h-[34px] px-3 py-1 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-over Dossier Inspector Drawer */}
      {selectedApp && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-[#1A1217]/55"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dossier-title"
          onClick={() => {
            if (!pendingAction && !lightbox) setSelectedId(null);
          }}
        >
          <div
            className="flex h-full w-full max-w-2xl flex-col bg-[#EDE6D6] text-[#1A1217] shadow-2xl border-l border-[#1A1217]/20"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#1A1217]/14 bg-[#FAF6EE] px-6 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">
                    {selectedApp.track || 'Security'} Applicant
                  </span>
                  <span
                    className={`v-status ${
                      selectedApp.status === 'accepted'
                        ? 'v-status-accepted'
                        : selectedApp.status === 'rejected'
                          ? 'v-status-rejected'
                          : 'v-status-pending'
                    }`}
                  >
                    {selectedApp.status}
                  </span>
                </div>
                <h3 id="dossier-title" className="mt-1 font-display text-xl font-semibold text-[#1A1217]">
                  {selectedApp.full_name}
                </h3>
                <p className="text-xs text-[#1A1217]/65 tabular-nums">
                  Submitted {formatDateTime(selectedApp.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close application dossier"
                className="rounded-[2px] p-2 text-[#1A1217]/70 hover:bg-[#EDE6D6] hover:text-[#1A1217]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Drawer scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Applicant Metadata */}
              <div className="grid grid-cols-1 gap-3.5 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/55">Email</span>
                  <span className="text-sm font-medium text-[#1A1217] break-all">{selectedApp.email}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/55">Phone Number</span>
                  <span className="text-sm font-medium tabular-nums text-[#1A1217]">{selectedApp.phone || '—'}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/55">Emergency Contact</span>
                  <span className="text-sm font-medium text-[#1A1217]">{selectedApp.emergency_contact || '—'}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/55">School Name</span>
                  <span className="text-sm font-medium text-[#1A1217]">{selectedApp.school || '—'}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/55">Gender &amp; Grade</span>
                  <span className="text-sm font-medium text-[#1A1217]">
                    {selectedApp.gender || '—'}
                    {selectedApp.grade ? ` · Grade ${selectedApp.grade}` : ''}
                  </span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/55">Attend All Days?</span>
                  <span
                    className={`text-sm font-semibold ${
                      selectedApp.attend_all_days === false ? 'text-[#8A2B2B]' : 'text-[#2F6B34]'
                    }`}
                  >
                    {selectedApp.attend_all_days === false ? 'No (Partial availability)' : 'Yes (All days)'}
                  </span>
                </div>
              </div>

              {/* Experience */}
              <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                  Previous Experiences
                </h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#1A1217]">
                  {selectedApp.experience || 'None provided.'}
                </p>
              </section>

              {/* Proof Files */}
              <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                    Proof of Experiences ({Array.isArray(selectedApp.proof_urls) ? selectedApp.proof_urls.length : 0})
                  </h4>
                  <span className="text-[11px] text-[#1A1217]/55">Private EB/Head Signed Access</span>
                </div>

                {proofLoading ? (
                  <p className="mt-3 text-xs text-[#1A1217]/65">Generating temporary secure preview links...</p>
                ) : proofs.length === 0 ? (
                  <p className="mt-3 text-sm text-[#1A1217]/60">No proof files attached.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {proofs.map((p, idx) => (
                      <div
                        key={p.name + idx}
                        className="flex flex-col justify-between gap-2.5 rounded-[2px] border border-[#1A1217]/14 bg-[#EDE6D6]/50 p-3"
                      >
                        {p.isImage ? (
                          <button
                            type="button"
                            onClick={() => setLightbox(p)}
                            className="group relative block overflow-hidden rounded-[2px] bg-[#EDE6D6] text-left"
                            aria-label={`Zoom proof image ${p.name}`}
                          >
                            <img
                              src={p.url}
                              alt={p.name}
                              className="h-32 w-full object-cover transition group-hover:opacity-90"
                            />
                            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-[2px] bg-[#1A1217]/80 px-2 py-0.5 text-[11px] font-medium text-[#EDE6D6]">
                              <ZoomIn className="h-3 w-3" aria-hidden="true" />
                              Zoom
                            </span>
                          </button>
                        ) : (
                          <div className="flex h-32 items-center justify-center rounded-[2px] bg-[#EDE6D6] text-xs font-semibold uppercase tracking-wider text-[#1A1217]/75">
                            <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {p.name.split('.').pop() || 'DOCUMENT'}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#1A1217]">{p.name}</p>
                            {p.size ? (
                              <p className="text-[11px] tabular-nums text-[#1A1217]/55">{formatFileSize(p.size)}</p>
                            ) : null}
                          </div>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="v-btn v-btn-secondary min-h-[30px] px-2.5 py-1 text-xs"
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            <span>Open</span>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Long-form Security Questions */}
              <section className="space-y-4 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4">
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                    Why Security? ({countWords(selectedApp.why)} words)
                  </span>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#1A1217]">
                    {selectedApp.why || '—'}
                  </p>
                </div>

                <div className="border-t border-[#1A1217]/10 pt-3.5">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                    Role of Security at a MUN Conference ({countWords(selectedApp.role_understanding)} words)
                  </span>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#1A1217]">
                    {selectedApp.role_understanding || '—'}
                  </p>
                </div>

                <div className="border-t border-[#1A1217]/10 pt-3.5">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                    Delegate Fight Precautions ({countWords(selectedApp.fight_precautions)} words)
                  </span>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#1A1217]">
                    {selectedApp.fight_precautions || '—'}
                  </p>
                </div>

                <div className="border-t border-[#1A1217]/10 pt-3.5">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                    Ensuring Rules Enforcement ({countWords(selectedApp.rules_enforcement)} words)
                  </span>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#1A1217]">
                    {selectedApp.rules_enforcement || '—'}
                  </p>
                </div>

                <div className="border-t border-[#1A1217]/10 pt-3.5">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                    Issues Reported
                  </span>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[#1A1217]">
                    {selectedApp.issues_note || 'N/A'}
                  </p>
                </div>
              </section>

              {/* Existing Notes */}
              {(selectedApp.recommendation_note || selectedApp.decision_note) && (
                <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4 space-y-2 text-sm">
                  {selectedApp.recommendation_note && (
                    <p>
                      <span className="font-semibold text-[#1A1217]">Department Head Note: </span>
                      <span className="text-[#1A1217]/85">{selectedApp.recommendation_note}</span>
                    </p>
                  )}
                  {selectedApp.decision_note && (
                    <p>
                      <span className="font-semibold text-[#1A1217]">Executive Board Note: </span>
                      <span className="text-[#1A1217]/85">{selectedApp.decision_note}</span>
                    </p>
                  )}
                </section>
              )}
            </div>

            {/* Pinned Reviewer Action Footer */}
            <div className="border-t border-[#1A1217]/16 bg-[#FAF6EE] px-6 py-4 space-y-3">
              <div>
                <label htmlFor="reviewer-note" className="sr-only">
                  Reviewer or decision note (optional)
                </label>
                <input
                  id="reviewer-note"
                  type="text"
                  value={reviewerNote}
                  onChange={e => setReviewerNote(e.target.value)}
                  placeholder="Optional reviewer or decision note..."
                  className="v-input min-h-[38px] text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedApp.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPendingAction({ kind: 'recommend', app: selectedApp, value: 'accept' })}
                      className="v-btn v-btn-secondary min-h-[36px] px-3 text-xs"
                    >
                      Recommend Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAction({ kind: 'recommend', app: selectedApp, value: 'reject' })}
                      className="v-btn v-btn-danger-outline min-h-[36px] px-3 text-xs"
                    >
                      Recommend Reject
                    </button>
                  </>
                )}

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <button
                      type="button"
                      onClick={() => setPendingAction({ kind: 'decide', app: selectedApp, value: 'accepted' })}
                      className="v-btn v-btn-primary min-h-[36px] px-3.5 text-xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAction({ kind: 'decide', app: selectedApp, value: 'rejected' })}
                      className="v-btn v-btn-danger min-h-[36px] px-3.5 text-xs"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reject</span>
                    </button>
                    {selectedApp.status !== 'pending' && (
                      <button
                        type="button"
                        onClick={() => setPendingAction({ kind: 'decide', app: selectedApp, value: 'pending' })}
                        className="v-btn v-btn-secondary min-h-[36px] px-3 text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Reopen</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proof Image Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#1A1217]/92 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-[82vh] max-w-[92vw] border-2 border-[#EDE6D6] object-contain"
            onClick={e => e.stopPropagation()}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#EDE6D6]" onClick={e => e.stopPropagation()}>
            <span className="font-medium">{lightbox.name}</span>
            <a
              href={lightbox.url}
              target="_blank"
              rel="noopener noreferrer"
              className="v-btn v-btn-secondary min-h-[36px]"
            >
              Open original
            </a>
            <button type="button" onClick={() => setLightbox(null)} className="v-btn v-btn-primary min-h-[36px]">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      <ConfirmModal
        open={Boolean(pendingAction)}
        title={
          pendingAction?.kind === 'recommend'
            ? `Confirm Head Recommendation (${pendingAction.value})`
            : `Confirm Final Decision (${pendingAction?.value})`
        }
        description={
          pendingAction
            ? pendingAction.kind === 'recommend'
              ? `Record a "${pendingAction.value}" recommendation for ${pendingAction.app.full_name}? Executive Board admins will see this in their review queue.`
              : `Set ${pendingAction.app.full_name}'s final application status to "${pendingAction.value}"?`
            : ''
        }
        confirmLabel="Confirm"
        danger={pendingAction?.value === 'reject' || pendingAction?.value === 'rejected'}
        busy={submittingAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={executeConfirmedAction}
      />
    </div>
  );
};
