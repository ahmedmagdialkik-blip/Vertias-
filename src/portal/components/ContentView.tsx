import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  Save,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { compressImageFile } from '../../utils/imageCompression';
import { reorderList, sanitizeImageUrl } from '../../utils/portalLogic';
import {
  recordPortalAuditLog,
  sb,
  TEAM_PHOTOS_BUCKET,
  type PortalProfile,
  type PortalSiteContentRow,
  type PortalTeamCard
} from '../supabaseClient';
import { ConfirmModal } from './ConfirmModal';

interface ContentViewProps {
  me: PortalProfile;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

interface CmsSectionState {
  hero_tagline: string;
  about_text: string;
  committees: { tba: boolean; items: Array<{ name: string; details: string }> };
  schedule: { tba: boolean; items: Array<{ when: string; title: string; details: string }> };
  faq: { tba: boolean; items: Array<{ q: string; a: string }> };
}

const DEFAULT_CMS_STATE: CmsSectionState = {
  hero_tagline: 'Where diplomacy meets truth.',
  about_text: '',
  committees: { tba: true, items: [] },
  schedule: { tba: true, items: [] },
  faq: { tba: true, items: [] }
};

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

export const ContentView: React.FC<ContentViewProps> = ({ me, onToast }) => {
  const [activeTab, setActiveTab] = useState<'sections' | 'team' | 'raw'>('sections');
  const [cms, setCms] = useState<CmsSectionState>(DEFAULT_CMS_STATE);
  const [rawRows, setRawRows] = useState<PortalSiteContentRow[]>([]);
  const [rawDrafts, setRawDrafts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [loadingCms, setLoadingCms] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const [cards, setCards] = useState<PortalTeamCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [cardFormOpen, setCardFormOpen] = useState(false);
  const [cardForm, setCardForm] = useState<CardFormState>(EMPTY_CARD);
  const [savingCard, setSavingCard] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);

  const [deleteCardTarget, setDeleteCardTarget] = useState<PortalTeamCard | null>(null);
  const [deleteKeyTarget, setDeleteKeyTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadContent = useCallback(async () => {
    setLoadingCms(true);
    const { data, error } = await sb.from('site_content').select('*').order('key');
    if (error) {
      onToast('error', error.message || 'Could not load site content.');
      setLoadingCms(false);
      return;
    }

    const rows = (data as PortalSiteContentRow[]) || [];
    setRawRows(rows);

    const draftMap: Record<string, string> = {};
    const valMap: Record<string, unknown> = {};
    for (const r of rows) {
      valMap[r.key] = r.value;
      draftMap[r.key] = typeof r.value === 'string' ? r.value : JSON.stringify(r.value, null, 2);
    }
    setRawDrafts(draftMap);

    const parseObj = <T,>(k: string, fallback: T): T => {
      const v = valMap[k];
      return v && typeof v === 'object' ? (v as T) : fallback;
    };

    const comm = parseObj<{ tba?: boolean; showTba?: boolean; items?: Array<{ name?: string; details?: string }> }>(
      'committees',
      {}
    );
    const sched = parseObj<{
      tba?: boolean;
      showTba?: boolean;
      items?: Array<{ when?: string; dateTime?: string; title?: string; details?: string }>;
    }>('schedule', {});
    const fq = parseObj<{
      tba?: boolean;
      showTba?: boolean;
      items?: Array<{ q?: string; question?: string; a?: string; answer?: string }>;
    }>('faq', {});

    setCms({
      hero_tagline: typeof valMap.hero_tagline === 'string' ? valMap.hero_tagline : DEFAULT_CMS_STATE.hero_tagline,
      about_text: typeof valMap.about_text === 'string' ? valMap.about_text : '',
      committees: {
        tba: typeof comm.tba === 'boolean' ? comm.tba : typeof comm.showTba === 'boolean' ? comm.showTba : true,
        items: Array.isArray(comm.items)
          ? comm.items.map(it => ({ name: it.name || '', details: it.details || '' }))
          : []
      },
      schedule: {
        tba: typeof sched.tba === 'boolean' ? sched.tba : typeof sched.showTba === 'boolean' ? sched.showTba : true,
        items: Array.isArray(sched.items)
          ? sched.items.map(it => ({
              when: it.when || it.dateTime || '',
              title: it.title || '',
              details: it.details || ''
            }))
          : []
      },
      faq: {
        tba: typeof fq.tba === 'boolean' ? fq.tba : typeof fq.showTba === 'boolean' ? fq.showTba : true,
        items: Array.isArray(fq.items)
          ? fq.items.map(it => ({
              q: it.q || it.question || '',
              a: it.a || it.answer || ''
            }))
          : []
      }
    });
    setLoadingCms(false);
  }, [onToast]);

  const loadCards = useCallback(async () => {
    setLoadingCards(true);
    const { data, error } = await sb
      .from('team_cards')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      onToast('error', error.message || 'Could not load Secretariat cards.');
      setLoadingCards(false);
      return;
    }
    setCards((data as PortalTeamCard[]) || []);
    setLoadingCards(false);
  }, [onToast]);

  useEffect(() => {
    loadContent();
    loadCards();
  }, [loadContent, loadCards]);

  const saveCmsKey = async (key: string, value: unknown) => {
    setSavingSection(key);
    try {
      const { error } = await sb.from('site_content').upsert(
        {
          key,
          value,
          updated_by: me.id,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'key' }
      );
      if (error) {
        onToast('error', error.message || `Could not save "${key}".`);
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'content.update', { key });
      onToast('success', `Published update to "${key}".`);
      await loadContent();
    } finally {
      setSavingSection(null);
    }
  };

  const handleSaveRaw = async (key: string) => {
    const raw = rawDrafts[key] ?? '';
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    await saveCmsKey(key, parsed);
  };

  const handleConfirmDeleteKey = async () => {
    if (!deleteKeyTarget) return;
    setDeleting(true);
    try {
      const { error } = await sb.from('site_content').delete().eq('key', deleteKeyTarget);
      if (error) {
        onToast('error', error.message || 'Could not delete key.');
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'content.delete', { key: deleteKeyTarget });
      onToast('success', `Deleted key "${deleteKeyTarget}".`);
      setDeleteKeyTarget(null);
      await loadContent();
    } finally {
      setDeleting(false);
    }
  };

  // Team cards actions
  const persistOrder = async (nextCards: PortalTeamCard[]) => {
    setCards(nextCards);
    const updates = nextCards.map((c, idx) => sb.from('team_cards').update({ sort_order: idx }).eq('id', c.id));
    const results = await Promise.all(updates);
    const firstError = results.find(r => r.error)?.error;
    if (firstError) {
      onToast('error', firstError.message || 'Could not save new card order.');
      await loadCards();
      return;
    }
    await recordPortalAuditLog(me.id, me.email, 'team_cards.reorder', {
      order: nextCards.map(c => c.full_name)
    });
    onToast('success', 'Secretariat order updated.');
  };

  const handleMoveCard = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= cards.length) return;
    const next = reorderList(cards, fromIdx, toIdx).map((c, idx) => ({ ...c, sort_order: idx }));
    await persistOrder(next);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setCompressionNote(null);
    try {
      const compressed = await compressImageFile(file, 1000, 0.82);
      const originalKb = Math.round(file.size / 1024);
      const compressedKb = Math.round(compressed.blob.size / 1024);
      const filePath = `cards/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${compressed.extension}`;

      const { error: uploadError } = await sb.storage
        .from(TEAM_PHOTOS_BUCKET)
        .upload(filePath, compressed.blob, {
          contentType: compressed.mimeType,
          upsert: false
        });
      if (uploadError) {
        onToast('error', uploadError.message || 'Photo upload failed.');
        return;
      }

      const { data: pubData } = sb.storage.from(TEAM_PHOTOS_BUCKET).getPublicUrl(filePath);
      setCardForm(f => ({ ...f, photo_url: pubData.publicUrl }));
      setCompressionNote(`Compressed ${originalKb} KB -> ${compressedKb} KB`);
      onToast('success', 'Photo uploaded.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = cardForm.full_name.trim();
    const cleanTitle = cardForm.title.trim();
    const safeUrl = sanitizeImageUrl(cardForm.photo_url);

    if (!cleanName || !cleanTitle) {
      onToast('error', 'Name and title are required.');
      return;
    }

    setSavingCard(true);
    try {
      if (cardForm.id) {
        const { error } = await sb
          .from('team_cards')
          .update({
            full_name: cleanName,
            title: cleanTitle,
            photo_url: safeUrl,
            visible: cardForm.visible
          })
          .eq('id', cardForm.id);
        if (error) {
          onToast('error', error.message || 'Could not update card.');
          return;
        }
        await recordPortalAuditLog(me.id, me.email, 'team_cards.update', {
          full_name: cleanName,
          title: cleanTitle
        });
        onToast('success', `Updated ${cleanName}.`);
      } else {
        const { error } = await sb.from('team_cards').insert({
          full_name: cleanName,
          title: cleanTitle,
          photo_url: safeUrl,
          sort_order: cards.length,
          visible: cardForm.visible
        });
        if (error) {
          onToast('error', error.message || 'Could not add card.');
          return;
        }
        await recordPortalAuditLog(me.id, me.email, 'team_cards.create', {
          full_name: cleanName,
          title: cleanTitle
        });
        onToast('success', `Added ${cleanName}.`);
      }
      setCardFormOpen(false);
      await loadCards();
    } finally {
      setSavingCard(false);
    }
  };

  const handleToggleVisible = async (card: PortalTeamCard) => {
    const nextVis = !card.visible;
    const { error } = await sb.from('team_cards').update({ visible: nextVis }).eq('id', card.id);
    if (error) {
      onToast('error', error.message || 'Could not update visibility.');
      return;
    }
    await recordPortalAuditLog(me.id, me.email, 'team_cards.visibility', {
      full_name: card.full_name,
      visible: nextVis
    });
    onToast('success', `${card.full_name} is now ${nextVis ? 'visible' : 'hidden'}.`);
    await loadCards();
  };

  const handleConfirmDeleteCard = async () => {
    if (!deleteCardTarget) return;
    setDeleting(true);
    try {
      const { error } = await sb.from('team_cards').delete().eq('id', deleteCardTarget.id);
      if (error) {
        onToast('error', error.message || 'Could not delete card.');
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'team_cards.delete', {
        full_name: deleteCardTarget.full_name
      });
      onToast('success', `Removed ${deleteCardTarget.full_name}.`);
      setDeleteCardTarget(null);
      await loadCards();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5 v-animate-in">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1A1217]/14 pb-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#1A1217]">Website Content</h2>
          <p className="mt-1 text-sm text-[#1A1217]/70">
            Update public conference copy, TBA section disclosures, Secretariat cards, and raw content keys.
          </p>
        </div>

        <div className="inline-flex rounded-[2px] border border-[#1A1217]/15 bg-[#FAF6EE] p-1" role="tablist">
          {[
            { id: 'sections', label: 'Public Sections' },
            { id: 'team', label: 'Secretariat Cards' },
            { id: 'raw', label: 'Raw Keys' }
          ].map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id as 'sections' | 'team' | 'raw')}
              className={`rounded-[2px] px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-[#1A1217] text-[#EDE6D6]'
                  : 'text-[#1A1217]/70 hover:text-[#1A1217]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'sections' && (
        <div className="space-y-6">
          {loadingCms ? (
            <div className="space-y-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-28 w-full animate-pulse rounded-[2px] bg-[#FAF6EE]" />
              ))}
            </div>
          ) : (
            <>
              {/* Hero Tagline & About */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Hero Tagline</h3>
                    <button
                      type="button"
                      disabled={savingSection === 'hero_tagline'}
                      onClick={() => saveCmsKey('hero_tagline', cms.hero_tagline)}
                      className="v-btn v-btn-primary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{savingSection === 'hero_tagline' ? 'Saving...' : 'Save Tagline'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    aria-label="Hero tagline"
                    value={cms.hero_tagline}
                    onChange={e => setCms(prev => ({ ...prev, hero_tagline: e.target.value }))}
                    className="v-input"
                  />
                </section>

                <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider">About Section</h3>
                    <button
                      type="button"
                      disabled={savingSection === 'about_text'}
                      onClick={() => saveCmsKey('about_text', cms.about_text)}
                      className="v-btn v-btn-primary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{savingSection === 'about_text' ? 'Saving...' : 'Save About'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    aria-label="About prose"
                    placeholder="Separate paragraphs with a blank line. Leave empty to use default conference prose."
                    value={cms.about_text}
                    onChange={e => setCms(prev => ({ ...prev, about_text: e.target.value }))}
                    className="v-input min-h-[110px]"
                  />
                </section>
              </div>

              {/* Committees */}
              <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1217]/12 pb-3">
                  <div className="flex items-center gap-4">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Committees</h3>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1A1217]/80">
                      <input
                        type="checkbox"
                        checked={cms.committees.tba}
                        onChange={e =>
                          setCms(prev => ({
                            ...prev,
                            committees: { ...prev.committees, tba: e.target.checked }
                          }))
                        }
                        className="h-4 w-4 accent-[#2F6B34]"
                      />
                      <span>Show as TBA</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCms(prev => ({
                          ...prev,
                          committees: {
                            ...prev.committees,
                            items: [...prev.committees.items, { name: '', details: '' }]
                          }
                        }))
                      }
                      className="v-btn v-btn-secondary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add Committee</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingSection === 'committees'}
                      onClick={() => saveCmsKey('committees', cms.committees)}
                      className="v-btn v-btn-primary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{savingSection === 'committees' ? 'Saving...' : 'Publish Committees'}</span>
                    </button>
                  </div>
                </div>

                {cms.committees.items.length === 0 ? (
                  <p className="text-sm text-[#1A1217]/65">
                    No committee entries yet. Uncheck "Show as TBA" once entries are ready.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {cms.committees.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 gap-3 rounded-[2px] border border-[#1A1217]/12 bg-[#EDE6D6]/40 p-3.5 sm:grid-cols-12"
                      >
                        <input
                          type="text"
                          placeholder="Committee name"
                          value={item.name}
                          onChange={e =>
                            setCms(prev => ({
                              ...prev,
                              committees: {
                                ...prev.committees,
                                items: prev.committees.items.map((it, i) =>
                                  i === idx ? { ...it, name: e.target.value } : it
                                )
                              }
                            }))
                          }
                          className="v-input sm:col-span-4"
                        />
                        <input
                          type="text"
                          placeholder="Topic & details"
                          value={item.details}
                          onChange={e =>
                            setCms(prev => ({
                              ...prev,
                              committees: {
                                ...prev.committees,
                                items: prev.committees.items.map((it, i) =>
                                  i === idx ? { ...it, details: e.target.value } : it
                                )
                              }
                            }))
                          }
                          className="v-input sm:col-span-7"
                        />
                        <button
                          type="button"
                          aria-label={`Remove committee ${idx + 1}`}
                          onClick={() =>
                            setCms(prev => ({
                              ...prev,
                              committees: {
                                ...prev.committees,
                                items: prev.committees.items.filter((_, i) => i !== idx)
                              }
                            }))
                          }
                          className="v-btn v-btn-danger-outline sm:col-span-1 px-2"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Schedule */}
              <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1217]/12 pb-3">
                  <div className="flex items-center gap-4">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Schedule</h3>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1A1217]/80">
                      <input
                        type="checkbox"
                        checked={cms.schedule.tba}
                        onChange={e =>
                          setCms(prev => ({
                            ...prev,
                            schedule: { ...prev.schedule, tba: e.target.checked }
                          }))
                        }
                        className="h-4 w-4 accent-[#2F6B34]"
                      />
                      <span>Show as TBA</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCms(prev => ({
                          ...prev,
                          schedule: {
                            ...prev.schedule,
                            items: [...prev.schedule.items, { when: '', title: '', details: '' }]
                          }
                        }))
                      }
                      className="v-btn v-btn-secondary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add Session</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingSection === 'schedule'}
                      onClick={() => saveCmsKey('schedule', cms.schedule)}
                      className="v-btn v-btn-primary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{savingSection === 'schedule' ? 'Saving...' : 'Publish Schedule'}</span>
                    </button>
                  </div>
                </div>

                {cms.schedule.items.length === 0 ? (
                  <p className="text-sm text-[#1A1217]/65">No schedule sessions added yet.</p>
                ) : (
                  <div className="space-y-3">
                    {cms.schedule.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 gap-3 rounded-[2px] border border-[#1A1217]/12 bg-[#EDE6D6]/40 p-3.5 sm:grid-cols-12"
                      >
                        <input
                          type="text"
                          placeholder="When (e.g. Day 1 · 09:00)"
                          value={item.when}
                          onChange={e =>
                            setCms(prev => ({
                              ...prev,
                              schedule: {
                                ...prev.schedule,
                                items: prev.schedule.items.map((it, i) =>
                                  i === idx ? { ...it, when: e.target.value } : it
                                )
                              }
                            }))
                          }
                          className="v-input sm:col-span-3"
                        />
                        <input
                          type="text"
                          placeholder="Session title"
                          value={item.title}
                          onChange={e =>
                            setCms(prev => ({
                              ...prev,
                              schedule: {
                                ...prev.schedule,
                                items: prev.schedule.items.map((it, i) =>
                                  i === idx ? { ...it, title: e.target.value } : it
                                )
                              }
                            }))
                          }
                          className="v-input sm:col-span-4"
                        />
                        <input
                          type="text"
                          placeholder="Location / notes"
                          value={item.details}
                          onChange={e =>
                            setCms(prev => ({
                              ...prev,
                              schedule: {
                                ...prev.schedule,
                                items: prev.schedule.items.map((it, i) =>
                                  i === idx ? { ...it, details: e.target.value } : it
                                )
                              }
                            }))
                          }
                          className="v-input sm:col-span-4"
                        />
                        <button
                          type="button"
                          aria-label={`Remove session ${idx + 1}`}
                          onClick={() =>
                            setCms(prev => ({
                              ...prev,
                              schedule: {
                                ...prev.schedule,
                                items: prev.schedule.items.filter((_, i) => i !== idx)
                              }
                            }))
                          }
                          className="v-btn v-btn-danger-outline sm:col-span-1 px-2"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* FAQ */}
              <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1217]/12 pb-3">
                  <div className="flex items-center gap-4">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider">FAQ</h3>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1A1217]/80">
                      <input
                        type="checkbox"
                        checked={cms.faq.tba}
                        onChange={e =>
                          setCms(prev => ({
                            ...prev,
                            faq: { ...prev.faq, tba: e.target.checked }
                          }))
                        }
                        className="h-4 w-4 accent-[#2F6B34]"
                      />
                      <span>Show as TBA</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCms(prev => ({
                          ...prev,
                          faq: { ...prev.faq, items: [...prev.faq.items, { q: '', a: '' }] }
                        }))
                      }
                      className="v-btn v-btn-secondary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Add FAQ</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingSection === 'faq'}
                      onClick={() => saveCmsKey('faq', cms.faq)}
                      className="v-btn v-btn-primary min-h-[34px] px-3 py-1 text-xs"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{savingSection === 'faq' ? 'Saving...' : 'Publish FAQ'}</span>
                    </button>
                  </div>
                </div>

                {cms.faq.items.length === 0 ? (
                  <p className="text-sm text-[#1A1217]/65">No FAQ items added yet.</p>
                ) : (
                  <div className="space-y-3">
                    {cms.faq.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 gap-3 rounded-[2px] border border-[#1A1217]/12 bg-[#EDE6D6]/40 p-3.5 sm:grid-cols-12"
                      >
                        <input
                          type="text"
                          placeholder="Question"
                          value={item.q}
                          onChange={e =>
                            setCms(prev => ({
                              ...prev,
                              faq: {
                                ...prev.faq,
                                items: prev.faq.items.map((it, i) => (i === idx ? { ...it, q: e.target.value } : it))
                              }
                            }))
                          }
                          className="v-input sm:col-span-5"
                        />
                        <input
                          type="text"
                          placeholder="Answer"
                          value={item.a}
                          onChange={e =>
                            setCms(prev => ({
                              ...prev,
                              faq: {
                                ...prev.faq,
                                items: prev.faq.items.map((it, i) => (i === idx ? { ...it, a: e.target.value } : it))
                              }
                            }))
                          }
                          className="v-input sm:col-span-6"
                        />
                        <button
                          type="button"
                          aria-label={`Remove FAQ ${idx + 1}`}
                          onClick={() =>
                            setCms(prev => ({
                              ...prev,
                              faq: { ...prev.faq, items: prev.faq.items.filter((_, i) => i !== idx) }
                            }))
                          }
                          className="v-btn v-btn-danger-outline sm:col-span-1 px-2"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4">
            <p className="text-sm text-[#1A1217]/75">
              Secretariat members shown on the public homepage. Lower order numbers appear first.
            </p>
            <button
              type="button"
              onClick={() => {
                setCardForm(EMPTY_CARD);
                setCompressionNote(null);
                setCardFormOpen(true);
              }}
              className="v-btn v-btn-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Add Secretariat Card</span>
            </button>
          </div>

          {loadingCards ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-20 w-full animate-pulse rounded-[2px] bg-[#FAF6EE]" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-8 text-center">
              <p className="font-editorial text-xl italic text-[#1A1217]/70">No Secretariat cards configured yet.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {cards.map((card, idx) => (
                <li
                  key={card.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-14 w-12 shrink-0 overflow-hidden rounded-[2px] border border-[#1A1217]/14 bg-[#EDE6D6]">
                      {card.photo_url ? (
                        <img
                          src={sanitizeImageUrl(card.photo_url)}
                          alt={card.full_name}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold text-[#1A1217] truncate">
                        {card.full_name}
                      </p>
                      <p className="text-xs font-medium text-[#2F6B34]">{card.title}</p>
                      <p className="text-xs tabular-nums text-[#1A1217]/60">
                        Order #{idx + 1} · {card.visible ? 'Visible' : 'Hidden'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveCard(idx, idx - 1)}
                      aria-label={`Move ${card.full_name} up`}
                      className="v-btn v-btn-secondary min-h-[34px] px-2.5 py-1"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === cards.length - 1}
                      onClick={() => handleMoveCard(idx, idx + 1)}
                      aria-label={`Move ${card.full_name} down`}
                      className="v-btn v-btn-secondary min-h-[34px] px-2.5 py-1"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleVisible(card)}
                      className="v-btn v-btn-secondary min-h-[34px] px-3 py-1 text-xs"
                    >
                      {card.visible ? (
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{card.visible ? 'Visible' : 'Hidden'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCardForm({
                          id: card.id,
                          full_name: card.full_name,
                          title: card.title,
                          photo_url: card.photo_url,
                          visible: card.visible
                        });
                        setCompressionNote(null);
                        setCardFormOpen(true);
                      }}
                      aria-label={`Edit ${card.full_name}`}
                      className="rounded-[2px] p-2 text-[#1A1217]/70 hover:bg-[#EDE6D6] hover:text-[#2F6B34]"
                    >
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteCardTarget(card)}
                      aria-label={`Delete ${card.full_name}`}
                      className="rounded-[2px] p-2 text-[#1A1217]/70 hover:bg-[#EDE6D6] hover:text-[#8A2B2B]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'raw' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4">
            <input
              type="text"
              placeholder="New content key (e.g. venue_note)"
              value={newKey}
              onChange={e => setNewKey(e.target.value.replace(/\W/g, '_'))}
              className="v-input max-w-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (newKey.trim()) {
                  void saveCmsKey(newKey.trim(), '');
                  setNewKey('');
                }
              }}
              className="v-btn v-btn-primary"
            >
              Add Key
            </button>
          </div>

          <div className="space-y-4">
            {rawRows.map(r => (
              <div key={r.key} className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[#2F6B34]">{r.key}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveRaw(r.key)}
                      className="v-btn v-btn-primary min-h-[32px] px-3 py-1 text-xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteKeyTarget(r.key)}
                      className="v-btn v-btn-danger-outline min-h-[32px] px-3 py-1 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  aria-label={`Raw value for ${r.key}`}
                  value={rawDrafts[r.key] ?? ''}
                  onChange={e => setRawDrafts(prev => ({ ...prev, [r.key]: e.target.value }))}
                  className="v-input font-mono text-xs min-h-[96px]"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Card Edit Modal */}
      {cardFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/70 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-modal-title"
        >
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[2px] border border-[#1A1217]/20 bg-[#FAF6EE] p-6 text-[#1A1217] shadow-2xl v-animate-in">
            <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3.5">
              <h3 id="card-modal-title" className="font-display text-base font-semibold uppercase tracking-wide">
                {cardForm.id ? 'Edit Secretariat Card' : 'Add Secretariat Card'}
              </h3>
              <button
                type="button"
                onClick={() => setCardFormOpen(false)}
                aria-label="Close card editor"
                className="p-1 text-[#1A1217]/60 hover:text-[#1A1217]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="mt-4 space-y-4">
              <div>
                <label htmlFor="c-name" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  id="c-name"
                  type="text"
                  required
                  value={cardForm.full_name}
                  onChange={e => setCardForm(f => ({ ...f, full_name: e.target.value }))}
                  className="v-input"
                />
              </div>

              <div>
                <label htmlFor="c-title" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Title / Role *
                </label>
                <input
                  id="c-title"
                  type="text"
                  required
                  placeholder="e.g. Secretary-General"
                  value={cardForm.title}
                  onChange={e => setCardForm(f => ({ ...f, title: e.target.value }))}
                  className="v-input"
                />
              </div>

              <div>
                <label htmlFor="c-photo-url" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Photo Upload or URL
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="v-btn v-btn-secondary cursor-pointer">
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{uploadingPhoto ? 'Uploading...' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingPhoto}
                      onChange={handlePhotoUpload}
                      className="sr-only"
                    />
                  </label>
                  {compressionNote && <span className="text-xs font-medium text-[#2F6B34]">{compressionNote}</span>}
                </div>
                <input
                  id="c-photo-url"
                  type="text"
                  placeholder="https://... or /assets/..."
                  value={cardForm.photo_url}
                  onChange={e => setCardForm(f => ({ ...f, photo_url: e.target.value }))}
                  className="v-input mt-2 text-xs"
                />
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={cardForm.visible}
                  onChange={e => setCardForm(f => ({ ...f, visible: e.target.checked }))}
                  className="h-4 w-4 accent-[#2F6B34]"
                />
                <span>Visible on public Secretariat section</span>
              </label>

              <div className="flex justify-end gap-2.5 pt-2">
                <button type="button" onClick={() => setCardFormOpen(false)} className="v-btn v-btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={savingCard || uploadingPhoto} className="v-btn v-btn-primary">
                  {savingCard ? 'Saving...' : 'Save Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteCardTarget)}
        title="Delete Secretariat Card"
        description={deleteCardTarget ? `Remove ${deleteCardTarget.full_name} from Secretariat?` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteCardTarget(null)}
        onConfirm={handleConfirmDeleteCard}
      />

      <ConfirmModal
        open={Boolean(deleteKeyTarget)}
        title="Delete Content Key"
        description={deleteKeyTarget ? `Permanently delete site_content key "${deleteKeyTarget}"?` : ''}
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setDeleteKeyTarget(null)}
        onConfirm={handleConfirmDeleteKey}
      />
    </div>
  );
};
