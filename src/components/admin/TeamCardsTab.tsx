import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Edit3, Eye, EyeOff, GripVertical, Plus, Trash2, Upload, X } from 'lucide-react';
import { recordAuditLog, supabase } from '../../lib/supabase';
import type { TeamCardRow } from '../../types/database';
import { compressImageFile } from '../../utils/imageCompression';
import { reorderList, sanitizeImageUrl } from '../../utils/portalLogic';
import { ConfirmModal } from '../ConfirmModal';

interface TeamCardsTabProps {
  onToast: (kind: 'success' | 'error', text: string) => void;
}

interface CardFormState {
  id: string | null;
  full_name: string;
  title: string;
  photo_url: string;
  visible: boolean;
}

const EMPTY_CARD: CardFormState = {
  id: null,
  full_name: '',
  title: '',
  photo_url: '',
  visible: true
};

export const TeamCardsTab: React.FC<TeamCardsTabProps> = ({ onToast }) => {
  const [cards, setCards] = useState<TeamCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CardFormState>(EMPTY_CARD);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TeamCardRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCards = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('team_cards')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      onToast('error', error.message || 'Could not load Secretariat cards.');
      setLoading(false);
      return;
    }
    setCards((data as TeamCardRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistOrder = async (nextCards: TeamCardRow[]) => {
    setCards(nextCards);
    if (!supabase) return;

    const updates = nextCards.map((c, idx) =>
      supabase!.from('team_cards').update({ sort_order: idx }).eq('id', c.id)
    );
    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error)?.error;
    if (firstError) {
      onToast('error', firstError.message || 'Could not save new card order.');
      await loadCards();
      return;
    }
    await recordAuditLog('team_cards.reorder', {
      order: nextCards.map(c => c.full_name)
    });
    onToast('success', 'Secretariat display order updated.');
  };

  const handleMove = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= cards.length) return;
    const next = reorderList(cards, fromIdx, toIdx).map((c, idx) => ({ ...c, sort_order: idx }));
    await persistOrder(next);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    setUploadingPhoto(true);
    setCompressionNote(null);
    try {
      const compressed = await compressImageFile(file, 1000, 0.82);
      const originalKb = Math.round(file.size / 1024);
      const compressedKb = Math.round(compressed.blob.size / 1024);
      const filePath = `cards/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${compressed.extension}`;

      const { error: uploadError } = await supabase.storage
        .from('team-photos')
        .upload(filePath, compressed.blob, {
          contentType: compressed.mimeType,
          upsert: false
        });

      if (uploadError) {
        onToast('error', uploadError.message || 'Photo upload failed.');
        return;
      }

      const { data: pubData } = supabase.storage.from('team-photos').getPublicUrl(filePath);
      setForm(f => ({ ...f, photo_url: pubData.publicUrl }));
      setCompressionNote(
        `Compressed ${originalKb} KB -> ${compressedKb} KB (${compressed.width}x${compressed.height})`
      );
      onToast('success', 'Photo uploaded to Storage.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const cleanName = form.full_name.trim();
    const cleanTitle = form.title.trim();
    const safeUrl = sanitizeImageUrl(form.photo_url);

    if (!cleanName || !cleanTitle) {
      onToast('error', 'Name and title are required.');
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        const { error } = await supabase
          .from('team_cards')
          .update({
            full_name: cleanName,
            title: cleanTitle,
            photo_url: safeUrl,
            visible: form.visible
          })
          .eq('id', form.id);

        if (error) {
          onToast('error', error.message || 'Failed to update team card.');
          return;
        }
        await recordAuditLog('team_cards.update', { full_name: cleanName, title: cleanTitle });
        onToast('success', `Updated ${cleanName}.`);
      } else {
        const nextOrder = cards.length;
        const { error } = await supabase.from('team_cards').insert({
          full_name: cleanName,
          title: cleanTitle,
          photo_url: safeUrl,
          sort_order: nextOrder,
          visible: form.visible
        });
        if (error) {
          onToast('error', error.message || 'Failed to add team card.');
          return;
        }
        await recordAuditLog('team_cards.create', { full_name: cleanName, title: cleanTitle });
        onToast('success', `Added ${cleanName} to Secretariat.`);
      }

      setFormOpen(false);
      setCompressionNote(null);
      await loadCards();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisible = async (card: TeamCardRow) => {
    if (!supabase) return;
    const nextVis = !card.visible;
    const { error } = await supabase
      .from('team_cards')
      .update({ visible: nextVis })
      .eq('id', card.id);
    if (error) {
      onToast('error', error.message || 'Could not update visibility.');
      return;
    }
    await recordAuditLog('team_cards.visibility', { full_name: card.full_name, visible: nextVis });
    onToast('success', `${card.full_name} is now ${nextVis ? 'visible' : 'hidden'} on the public site.`);
    await loadCards();
  };

  const handleDelete = async () => {
    if (!supabase || !deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('team_cards').delete().eq('id', deleteTarget.id);
      if (error) {
        onToast('error', error.message || 'Could not delete card.');
        return;
      }
      await recordAuditLog('team_cards.delete', { full_name: deleteTarget.full_name });
      onToast('success', `Removed ${deleteTarget.full_name}.`);
      setDeleteTarget(null);
      await loadCards();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#1A1217]/15 bg-[#FAF6EE] p-4">
        <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/80">
          Drag rows to reorder how cards appear in the Secretariat cluster, or use the arrow buttons.
        </p>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_CARD);
            setCompressionNote(null);
            setFormOpen(true);
          }}
          className="inline-flex min-h-[42px] items-center gap-1.5 whitespace-nowrap bg-[#2F6B34] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#EDE6D6] hover:bg-[#1F4A25]"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Add Card</span>
        </button>
      </div>

      {loading ? (
        <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-6">
          <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/75">
            Loading Secretariat cards...
          </p>
        </div>
      ) : cards.length === 0 ? (
        <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-8 text-center">
          <p className="font-['Cormorant_Garamond',Georgia,serif] text-xl italic text-[#1A1217]/75">
            No team cards configured yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((card, idx) => (
            <li
              key={card.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={e => e.preventDefault()}
              onDrop={async () => {
                if (dragIndex !== null && dragIndex !== idx) {
                  await handleMove(dragIndex, idx);
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex flex-wrap items-center justify-between gap-4 border bg-[#FAF6EE] p-4 transition ${
                dragIndex === idx ? 'border-[#2F6B34] opacity-70' : 'border-[#1A1217]/15'
              }`}
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="cursor-grab text-[#1A1217]/45 hover:text-[#1A1217]" aria-hidden="true">
                  <GripVertical className="h-5 w-5" />
                </span>
                <div className="h-16 w-14 shrink-0 border border-[#1A1217]/15 bg-[#EDE6D6] overflow-hidden">
                  {card.photo_url ? (
                    <img
                      src={sanitizeImageUrl(card.photo_url)}
                      alt={card.full_name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="font-['Cinzel',serif] text-base font-semibold text-[#1A1217] truncate">
                    {card.full_name}
                  </p>
                  <p className="font-['Cormorant_Garamond',Georgia,serif] text-base italic text-[#2F6B34]">
                    {card.title}
                  </p>
                  <p className="font-['Cormorant_Garamond',Georgia,serif] text-sm text-[#1A1217]/60 tabular-nums">
                    Order #{idx + 1} &middot; {card.visible ? 'Visible' : 'Hidden'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMove(idx, idx - 1)}
                  aria-label={`Move ${card.full_name} up`}
                  className="p-2 border border-[#1A1217]/15 text-[#1A1217] disabled:opacity-30 hover:border-[#1A1217]"
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={idx === cards.length - 1}
                  onClick={() => handleMove(idx, idx + 1)}
                  aria-label={`Move ${card.full_name} down`}
                  className="p-2 border border-[#1A1217]/15 text-[#1A1217] disabled:opacity-30 hover:border-[#1A1217]"
                >
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleVisible(card)}
                  aria-label={card.visible ? `Hide ${card.full_name}` : `Show ${card.full_name}`}
                  className="inline-flex min-h-[36px] items-center gap-1.5 border border-[#1A1217]/20 bg-[#EDE6D6] px-3 py-1 font-['Cinzel',serif] text-[11px] font-semibold uppercase tracking-wider"
                >
                  {card.visible ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>{card.visible ? 'Visible' : 'Hidden'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({
                      id: card.id,
                      full_name: card.full_name,
                      title: card.title,
                      photo_url: card.photo_url,
                      visible: card.visible
                    });
                    setCompressionNote(null);
                    setFormOpen(true);
                  }}
                  aria-label={`Edit ${card.full_name}`}
                  className="p-2 text-[#1A1217]/75 hover:text-[#2F6B34]"
                >
                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(card)}
                  aria-label={`Delete ${card.full_name}`}
                  className="p-2 text-[#1A1217]/75 hover:text-[#7C1E21]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/75 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-modal-title"
        >
          <div className="w-full max-w-lg border border-[#1A1217]/20 bg-[#EDE6D6] p-6 text-[#1A1217] shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1A1217]/15 pb-3">
              <h2 id="card-modal-title" className="font-['Cinzel',serif] text-lg font-semibold uppercase tracking-wide">
                {form.id ? 'Edit Team Card' : 'Add Secretariat Card'}
              </h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close card editor" className="p-1.5 text-[#1A1217]/70 hover:text-[#1A1217]">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="mt-4 space-y-4">
              <div>
                <label htmlFor="c-name" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  id="c-name"
                  type="text"
                  required
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                />
              </div>

              <div>
                <label htmlFor="c-title" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Title / Role *
                </label>
                <input
                  id="c-title"
                  type="text"
                  required
                  placeholder="e.g. Secretary-General"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                />
              </div>

              <div>
                <label htmlFor="c-photo-url" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Photo Upload or URL
                </label>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 border border-[#1A1217]/25 bg-[#FAF6EE] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider hover:border-[#1A1217]">
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{uploadingPhoto ? 'Uploading...' : 'Upload & Compress Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingPhoto}
                      onChange={handlePhotoUpload}
                      className="sr-only"
                    />
                  </label>
                  {compressionNote ? (
                    <span className="font-['Cormorant_Garamond',Georgia,serif] text-sm text-[#2F6B34]">
                      {compressionNote}
                    </span>
                  ) : null}
                </div>

                <input
                  id="c-photo-url"
                  type="text"
                  placeholder="https://... or /assets/..."
                  value={form.photo_url}
                  onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))}
                  className="mt-2 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-sm"
                />
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={form.visible}
                  onChange={e => setForm(f => ({ ...f, visible: e.target.checked }))}
                  className="h-4 w-4 accent-[#2F6B34]"
                />
                <span>Visible on public Secretariat section</span>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingPhoto}
                  className="min-h-[42px] bg-[#2F6B34] px-5 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#EDE6D6] hover:bg-[#1F4A25] disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Secretariat Card"
        description={deleteTarget ? `Remove ${deleteTarget.full_name} from the Secretariat display?` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};
