import React, { useMemo, useState } from 'react';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { formatDateTime } from '../../utils/portalAdminLogic';
import {
  recordPortalAuditLog,
  sb,
  type PortalAnnouncement,
  type PortalProfile,
  type PortalRosterEntry
} from '../supabaseClient';
import { ConfirmModal } from './ConfirmModal';

interface AnnouncementsViewProps {
  me: PortalProfile;
  announcements: PortalAnnouncement[];
  roster: PortalRosterEntry[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

export const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({
  me,
  announcements,
  roster,
  loading,
  onRefresh,
  onToast
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'department' | 'heads'>('all');
  const [targetDepartment, setTargetDepartment] = useState('');
  const [sending, setSending] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PortalAnnouncement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const knownDepartments = useMemo(() => {
    const set = new Set<string>();
    for (const r of roster) {
      if ((r.department || '').trim()) set.add(r.department.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [roster]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const cleanDept = targetDepartment.trim();

    if (!cleanTitle || !cleanBody) {
      onToast('error', 'Title and announcement message are required.');
      return;
    }
    if (audience === 'department' && !cleanDept) {
      onToast('error', 'Specify which department should receive this announcement.');
      return;
    }

    setSending(true);
    try {
      const { error } = await sb.from('announcements').insert({
        title: cleanTitle,
        body: cleanBody,
        audience,
        target_department: audience === 'department' ? cleanDept : null,
        created_by: me.id
      });
      if (error) {
        onToast('error', error.message || 'Could not publish announcement.');
        return;
      }

      await recordPortalAuditLog(me.id, me.email, 'announcement.create', {
        title: cleanTitle,
        audience,
        target_department: audience === 'department' ? cleanDept : null
      });
      setTitle('');
      setBody('');
      setTargetDepartment('');
      setAudience('all');
      onToast('success', 'Announcement published.');
      await onRefresh();
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await sb.from('announcements').delete().eq('id', deleteTarget.id);
      if (error) {
        onToast('error', error.message || 'Could not delete announcement.');
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'announcement.delete', {
        id: deleteTarget.id,
        title: deleteTarget.title
      });
      onToast('success', 'Announcement deleted.');
      setDeleteTarget(null);
      await onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5 v-animate-in">
      <div className="border-b border-[#1A1217]/14 pb-4">
        <h2 className="font-display text-2xl font-semibold text-[#1A1217]">Announcements</h2>
        <p className="mt-1 text-sm text-[#1A1217]/70">
          Broadcast targeted briefings to all staff, department heads only, or a specific conference department.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
          <h3 className="border-b border-[#1A1217]/12 pb-3 font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
            Compose Announcement
          </h3>

          <form onSubmit={handlePublish} className="mt-4 space-y-4">
            <div>
              <label htmlFor="ann-title" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                Title *
              </label>
              <input
                id="ann-title"
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Briefing subject"
                className="v-input"
              />
            </div>

            <div>
              <label htmlFor="ann-audience" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                Audience
              </label>
              <select
                id="ann-audience"
                value={audience}
                onChange={e => setAudience(e.target.value as 'all' | 'department' | 'heads')}
                className="v-input"
              >
                <option value="all">Everyone on the team</option>
                <option value="department">Specific department</option>
                <option value="heads">Heads &amp; Executive Board only</option>
              </select>
            </div>

            {audience === 'department' && (
              <div>
                <label htmlFor="ann-dept" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Department Name *
                </label>
                <input
                  id="ann-dept"
                  type="text"
                  required
                  list="ann-dept-list"
                  value={targetDepartment}
                  onChange={e => setTargetDepartment(e.target.value)}
                  placeholder="e.g. Security, Volunteers"
                  className="v-input"
                />
                <datalist id="ann-dept-list">
                  {knownDepartments.map(dep => (
                    <option key={dep} value={dep} />
                  ))}
                </datalist>
              </div>
            )}

            <div>
              <label htmlFor="ann-body" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                Message *
              </label>
              <textarea
                id="ann-body"
                rows={5}
                required
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write announcement details..."
                className="v-input min-h-[120px]"
              />
            </div>

            <button type="submit" disabled={sending} className="v-btn v-btn-primary w-full">
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>{sending ? 'Publishing...' : 'Publish Announcement'}</span>
            </button>
          </form>
        </section>

        <section className="lg:col-span-7 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
                Published Notices
              </h3>
            </div>
            <span className="text-xs tabular-nums text-[#1A1217]/60">{announcements.length} total</span>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 w-full animate-pulse rounded-[2px] bg-[#EDE6D6]" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-editorial text-lg italic text-[#1A1217]/70">
                No announcements published yet.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#1A1217]/10">
              {announcements.map(item => (
                <li key={item.id} className="py-4 first:pt-1 last:pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-display text-base font-semibold text-[#1A1217]">{item.title}</h4>
                      <p className="mt-0.5 text-xs tabular-nums text-[#1A1217]/65">
                        {item.audience === 'all'
                          ? 'All Staff'
                          : item.audience === 'heads'
                            ? 'Heads & Admins'
                            : `${item.target_department || 'Department'} Dept`}{' '}
                        · {formatDateTime(item.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      aria-label={`Delete announcement ${item.title}`}
                      className="rounded-[2px] p-1.5 text-[#1A1217]/60 hover:bg-[#EDE6D6] hover:text-[#8A2B2B]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#1A1217]/85">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Announcement"
        description={deleteTarget ? `Delete "${deleteTarget.title}" permanently?` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};
