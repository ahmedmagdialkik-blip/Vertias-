import React, { useMemo, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { recordAuditLog, supabase } from '../../lib/supabase';
import type { AnnouncementAudience, AnnouncementRow, RosterRow } from '../../types/database';
import { ConfirmModal } from '../ConfirmModal';

interface AnnouncementsTabProps {
  announcements: AnnouncementRow[];
  roster: RosterRow[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

export const AnnouncementsTab: React.FC<AnnouncementsTabProps> = ({
  announcements,
  roster,
  loading,
  onRefresh,
  onToast
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [targetDepartment, setTargetDepartment] = useState('');
  const [sending, setSending] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const knownDepartments = useMemo(() => {
    const set = new Set<string>();
    for (const r of roster) {
      if (r.department.trim()) set.add(r.department.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [roster]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    const cleanDept = targetDepartment.trim();
    if (!cleanTitle || !cleanBody) {
      onToast('error', 'Title and announcement body are required.');
      return;
    }
    if (audience === 'department' && !cleanDept) {
      onToast('error', 'Specify which department should receive this announcement.');
      return;
    }

    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('announcements').insert({
        title: cleanTitle,
        body: cleanBody,
        audience,
        target_department: audience === 'department' ? cleanDept : null,
        created_by: userData.user?.id ?? null
      });

      if (error) {
        onToast('error', error.message || 'Could not publish announcement.');
        return;
      }

      await recordAuditLog('announcement.create', {
        title: cleanTitle,
        audience,
        target_department: audience === 'department' ? cleanDept : null
      });
      setTitle('');
      setBody('');
      setTargetDepartment('');
      setAudience('all');
      onToast('success', 'Announcement sent.');
      await onRefresh();
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!supabase || !deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', deleteTarget.id);
      if (error) {
        onToast('error', error.message || 'Could not delete announcement.');
        return;
      }
      await recordAuditLog('announcement.delete', { id: deleteTarget.id, title: deleteTarget.title });
      onToast('success', 'Announcement deleted.');
      setDeleteTarget(null);
      await onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="lg:col-span-5 border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
        <h2 className="border-b border-[#1A1217]/15 pb-3 font-['Cinzel',serif] text-sm font-semibold tracking-[0.08em] uppercase text-[#1A1217]">
          Compose Announcement
        </h2>

        <form onSubmit={handlePublish} className="mt-4 space-y-4">
          <div>
            <label htmlFor="ann-title" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
              Title *
            </label>
            <input
              id="ann-title"
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
            />
          </div>

          <div>
            <label htmlFor="ann-audience" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
              Audience
            </label>
            <select
              id="ann-audience"
              value={audience}
              onChange={e => setAudience(e.target.value as AnnouncementAudience)}
              className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
            >
              <option value="all">Everyone on the team</option>
              <option value="department">One department</option>
              <option value="heads">Heads &amp; admins only</option>
            </select>
          </div>

          {audience === 'department' ? (
            <div>
              <label htmlFor="ann-dept" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                Department Name *
              </label>
              <input
                id="ann-dept"
                type="text"
                required
                list="ann-dept-list"
                value={targetDepartment}
                onChange={e => setTargetDepartment(e.target.value)}
                placeholder="e.g. Crisis"
                className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
              />
              <datalist id="ann-dept-list">
                {knownDepartments.map(dep => (
                  <option key={dep} value={dep} />
                ))}
              </datalist>
            </div>
          ) : null}

          <div>
            <label htmlFor="ann-body" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
              Message *
            </label>
            <textarea
              id="ann-body"
              rows={5}
              required
              value={body}
              onChange={e => setBody(e.target.value)}
              className="mt-1 w-full border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-2 text-base"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 bg-[#2F6B34] px-5 py-2.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-[0.12em] text-[#EDE6D6] hover:bg-[#1F4A25] disabled:opacity-60"
          >
            <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{sending ? 'Sending...' : 'Send Announcement'}</span>
          </button>
        </form>
      </section>

      <section className="lg:col-span-7 border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
        <h2 className="border-b border-[#1A1217]/15 pb-3 font-['Cinzel',serif] text-sm font-semibold tracking-[0.08em] uppercase text-[#1A1217]">
          Sent Announcements
        </h2>

        {loading ? (
          <p className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/75">
            Loading announcements...
          </p>
        ) : announcements.length === 0 ? (
          <p className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg italic text-[#1A1217]/75">
            No announcements sent yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {announcements.map(item => (
              <li key={item.id} className="border border-[#1A1217]/15 bg-[#EDE6D6]/45 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-['Cinzel',serif] text-base font-semibold text-[#1A1217]">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 font-['Cormorant_Garamond',Georgia,serif] text-sm tabular-nums text-[#1A1217]/70">
                      Audience:{' '}
                      {item.audience === 'all'
                        ? 'Everyone'
                        : item.audience === 'heads'
                          ? 'Heads Only'
                          : `${item.target_department || 'Department'} Dept`}{' '}
                      &middot; {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    aria-label={`Delete announcement ${item.title}`}
                    className="p-2 text-[#1A1217]/65 hover:text-[#7C1E21]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-line font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/90">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

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
