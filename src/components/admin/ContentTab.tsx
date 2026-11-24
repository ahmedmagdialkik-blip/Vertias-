import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Plus, Save, Send, Trash2 } from 'lucide-react';
import { recordAuditLog, supabase } from '../../lib/supabase';
import type { FullSiteContent } from '../../types/database';
import { DEFAULT_SITE_CONTENT, mergeSiteContentWithFallback } from '../../utils/portalLogic';
import { ConfirmModal } from '../ConfirmModal';

interface ContentTabProps {
  onToast: (kind: 'success' | 'error', text: string) => void;
}

type SectionKey = 'hero' | 'about' | 'committees' | 'schedule' | 'faq' | 'register';

export const ContentTab: React.FC<ContentTabProps> = ({ onToast }) => {
  const [draft, setDraft] = useState<FullSiteContent>(DEFAULT_SITE_CONTENT);
  const [published, setPublished] = useState<FullSiteContent>(DEFAULT_SITE_CONTENT);
  const [activeSection, setActiveSection] = useState<SectionKey>('hero');
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      supabase.from('site_content').select('key, value'),
      supabase.from('site_content_drafts').select('key, value')
    ]).then(([pubRes, draftRes]) => {
      if (cancelled) return;
      const pubMerged = mergeSiteContentWithFallback(pubRes.data ?? []);
      const draftRows = draftRes.data && draftRes.data.length > 0 ? draftRes.data : pubRes.data ?? [];
      const draftMerged = mergeSiteContentWithFallback(draftRows);
      setPublished(pubMerged);
      setDraft(draftMerged);
      setHasUnsavedDraft(JSON.stringify(pubMerged) !== JSON.stringify(draftMerged));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateDraft = (updater: (prev: FullSiteContent) => FullSiteContent) => {
    setDraft(prev => updater(prev));
    setHasUnsavedDraft(true);
  };

  const buildContentPairs = (state: FullSiteContent) => [
    { key: 'hero', value: state.hero },
    { key: 'about', value: state.about },
    { key: 'committees', value: state.committees },
    { key: 'schedule', value: state.schedule },
    { key: 'faq', value: state.faq },
    { key: 'register', value: state.register }
  ];

  const handleSaveDraft = async () => {
    if (!supabase) return;
    setSavingDraft(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const rows = buildContentPairs(draft).map(p => ({
        key: p.key,
        value: p.value,
        updated_by: uid,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('site_content_drafts')
        .upsert(rows, { onConflict: 'key' });

      if (error) {
        onToast('error', error.message || 'Could not save draft.');
        return;
      }

      await recordAuditLog('content.draft_saved', { section: activeSection });
      onToast('success', 'Draft saved privately. Visitors still see the last published version until you publish.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    if (!supabase) return;
    setPublishing(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const now = new Date().toISOString();
      const rows = buildContentPairs(draft).map(p => ({
        key: p.key,
        value: p.value,
        updated_by: uid,
        updated_at: now
      }));

      const [draftErr, pubErr] = await Promise.all([
        supabase.from('site_content_drafts').upsert(rows, { onConflict: 'key' }),
        supabase.from('site_content').upsert(rows, { onConflict: 'key' })
      ]);

      const err = draftErr.error || pubErr.error;
      if (err) {
        onToast('error', err.message || 'Could not publish site content.');
        return;
      }

      setPublished(draft);
      setHasUnsavedDraft(false);
      setPublishConfirmOpen(false);
      await recordAuditLog('content.published', {
        sections: ['hero', 'about', 'committees', 'schedule', 'faq', 'register']
      });
      onToast('success', 'Site content published live.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-6">
        <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/75">
          Loading site content...
        </p>
      </div>
    );
  }

  const sectionTabs: Array<{ key: SectionKey; label: string }> = [
    { key: 'hero', label: 'Hero' },
    { key: 'about', label: 'About' },
    { key: 'committees', label: 'Committees' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'faq', label: 'FAQ' },
    { key: 'register', label: 'Register' }
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#1A1217]/15 bg-[#FAF6EE] p-4">
        <div className="flex flex-wrap gap-1.5">
          {sectionTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSection(tab.key)}
              className={`min-h-[38px] whitespace-nowrap border px-3.5 py-1.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider transition ${
                activeSection === tab.key
                  ? 'border-[#1A1217] bg-[#1A1217] text-[#EDE6D6]'
                  : 'border-[#1A1217]/20 bg-[#EDE6D6]/60 text-[#1A1217] hover:border-[#1A1217]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(v => !v)}
            className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap border border-[#1A1217]/25 bg-[#EDE6D6] px-3 py-1.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#1A1217]"
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{showPreview ? 'Hide Preview' : 'Live Preview'}</span>
          </button>

          <button
            type="button"
            disabled={savingDraft}
            onClick={handleSaveDraft}
            className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap border border-[#1A1217] bg-[#FAF6EE] px-4 py-1.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#1A1217] hover:bg-[#EDE6D6] disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
          </button>

          <button
            type="button"
            disabled={publishing}
            onClick={() => setPublishConfirmOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap bg-[#2F6B34] px-4 py-1.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#EDE6D6] hover:bg-[#1F4A25] disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Publish Live</span>
          </button>
        </div>
      </div>

      {hasUnsavedDraft ? (
        <div className="border border-[#7C5A1E]/40 bg-[#FAF3E1] px-4 py-2.5 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#5C4112]">
          Draft differs from the currently published public site. Save your draft as you work, then click Publish Live when ready.
        </div>
      ) : null}

      <div className={`grid grid-cols-1 gap-6 ${showPreview ? 'xl:grid-cols-12' : ''}`}>
        <div className={`${showPreview ? 'xl:col-span-7' : ''} border border-[#1A1217]/15 bg-[#FAF6EE] p-5 space-y-5`}>
          {activeSection === 'hero' ? (
            <>
              <h2 className="border-b border-[#1A1217]/15 pb-3 font-['Cinzel',serif] text-sm font-semibold uppercase tracking-wider">
                Hero Section
              </h2>
              <div>
                <label htmlFor="hero-title" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Main Title
                </label>
                <input
                  id="hero-title"
                  type="text"
                  value={draft.hero.title}
                  onChange={e =>
                    updateDraft(prev => ({
                      ...prev,
                      hero: { ...prev.hero, title: e.target.value }
                    }))
                  }
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
                />
              </div>
              <div>
                <label htmlFor="hero-tagline" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Tagline
                </label>
                <input
                  id="hero-tagline"
                  type="text"
                  value={draft.hero.tagline}
                  onChange={e =>
                    updateDraft(prev => ({
                      ...prev,
                      hero: { ...prev.hero, tagline: e.target.value }
                    }))
                  }
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
                />
              </div>
              <div>
                <label htmlFor="hero-cta" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Primary Button Text
                </label>
                <input
                  id="hero-cta"
                  type="text"
                  value={draft.hero.ctaLabel}
                  onChange={e =>
                    updateDraft(prev => ({
                      ...prev,
                      hero: { ...prev.hero, ctaLabel: e.target.value }
                    }))
                  }
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
                />
              </div>
            </>
          ) : null}

          {activeSection === 'about' ? (
            <>
              <div className="flex items-center justify-between border-b border-[#1A1217]/15 pb-3">
                <h2 className="font-['Cinzel',serif] text-sm font-semibold uppercase tracking-wider">
                  About Paragraphs
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    updateDraft(prev => ({
                      ...prev,
                      about: { paragraphs: [...prev.about.paragraphs, ''] }
                    }))
                  }
                  className="inline-flex min-h-[36px] items-center gap-1.5 border border-[#1A1217]/25 bg-[#EDE6D6] px-3 py-1 font-['Cinzel',serif] text-[11px] font-semibold uppercase tracking-wider"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Paragraph</span>
                </button>
              </div>

              <div className="space-y-4">
                {draft.about.paragraphs.map((para, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor={`about-p-${idx}`} className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                        Paragraph {idx + 1}
                      </label>
                      {draft.about.paragraphs.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft(prev => ({
                              ...prev,
                              about: {
                                paragraphs: prev.about.paragraphs.filter((_, i) => i !== idx)
                              }
                            }))
                          }
                          aria-label={`Remove paragraph ${idx + 1}`}
                          className="p-1 text-[#7C1E21] hover:opacity-75"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    <textarea
                      id={`about-p-${idx}`}
                      rows={3}
                      value={para}
                      onChange={e =>
                        updateDraft(prev => ({
                          ...prev,
                          about: {
                            paragraphs: prev.about.paragraphs.map((p, i) =>
                              i === idx ? e.target.value : p
                            )
                          }
                        }))
                      }
                      className="w-full border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-2 text-base"
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {activeSection === 'committees' ||
          activeSection === 'schedule' ||
          activeSection === 'faq' ||
          activeSection === 'register' ? (
            <TbaSectionEditor
              sectionKey={activeSection}
              draft={draft}
              onUpdate={updateDraft}
            />
          ) : null}
        </div>

        {showPreview ? (
          <aside className="xl:col-span-5 border border-[#1A1217]/20 bg-[#1A1217] p-6 text-[#EDE6D6]">
            <div className="flex items-center justify-between border-b border-[#EDE6D6]/15 pb-3">
              <span className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.12em] uppercase text-[#4F9A57]">
                Live Preview ({activeSection})
              </span>
              <span className="font-['Cormorant_Garamond',Georgia,serif] text-sm italic text-[#EDE6D6]/65">
                {JSON.stringify(published[activeSection]) === JSON.stringify(draft[activeSection])
                  ? 'Matches published'
                  : 'Unpublished edits'}
              </span>
            </div>

            <div className="mt-5">
              {activeSection === 'hero' ? (
                <div className="space-y-4 py-4">
                  <p className="font-['Cinzel',serif] text-3xl sm:text-4xl font-semibold tracking-wide text-[#EDE6D6]">
                    {draft.hero.title || 'VERITAS MUN'}
                  </p>
                  <p className="font-['Cormorant_Garamond',Georgia,serif] text-xl italic text-[#EDE6D6]/85">
                    {draft.hero.tagline}
                  </p>
                  <span className="inline-block bg-[#4F9A57] px-5 py-2.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-widest text-[#1A1217]">
                    {draft.hero.ctaLabel || 'Register'}
                  </span>
                </div>
              ) : null}

              {activeSection === 'about' ? (
                <div className="space-y-4 bg-[#EDE6D6] p-5 text-[#1A1217]">
                  <h3 className="font-['Cinzel',serif] text-xl font-semibold">About</h3>
                  {draft.about.paragraphs.map((p, i) => (
                    <p key={i} className="font-['Cormorant_Garamond',Georgia,serif] text-lg leading-relaxed">
                      {p || <span className="italic opacity-50">(Empty paragraph)</span>}
                    </p>
                  ))}
                </div>
              ) : null}

              {activeSection === 'committees' ||
              activeSection === 'schedule' ||
              activeSection === 'faq' ||
              activeSection === 'register' ? (
                <PreviewTbaSection sectionKey={activeSection} data={draft} />
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <ConfirmModal
        open={publishConfirmOpen}
        title="Publish Site Content"
        description="Publish your saved and current content edits to the live Veritas MUN public website?"
        confirmLabel="Publish Live"
        danger={false}
        busy={publishing}
        onCancel={() => setPublishConfirmOpen(false)}
        onConfirm={handlePublish}
      />
    </div>
  );
};

interface TbaSectionEditorProps {
  sectionKey: 'committees' | 'schedule' | 'faq' | 'register';
  draft: FullSiteContent;
  onUpdate: (updater: (prev: FullSiteContent) => FullSiteContent) => void;
}

const TbaSectionEditor: React.FC<TbaSectionEditorProps> = ({ sectionKey, draft, onUpdate }) => {
  const sec = draft[sectionKey];

  const toggleShowTba = (checked: boolean) => {
    onUpdate(prev => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], showTba: checked }
    }));
  };

  const addItem = () => {
    onUpdate(prev => {
      if (sectionKey === 'committees') {
        return {
          ...prev,
          committees: {
            ...prev.committees,
            items: [...prev.committees.items, { name: '', details: '' }]
          }
        };
      }
      if (sectionKey === 'schedule') {
        return {
          ...prev,
          schedule: {
            ...prev.schedule,
            items: [...prev.schedule.items, { dateTime: '', title: '', details: '' }]
          }
        };
      }
      if (sectionKey === 'faq') {
        return {
          ...prev,
          faq: {
            ...prev.faq,
            items: [...prev.faq.items, { question: '', answer: '' }]
          }
        };
      }
      return {
        ...prev,
        register: {
          ...prev.register,
          items: [...prev.register.items, { title: '', details: '', linkLabel: '', linkUrl: '' }]
        }
      };
    });
  };

  const removeItem = (idx: number) => {
    onUpdate(prev => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        items: prev[sectionKey].items.filter((_, i) => i !== idx)
      }
    }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1217]/15 pb-3">
        <h2 className="font-['Cinzel',serif] text-sm font-semibold uppercase tracking-wider">
          {sectionKey} Section
        </h2>

        <label className="inline-flex cursor-pointer items-center gap-2.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
          <input
            type="checkbox"
            checked={sec.showTba}
            onChange={e => toggleShowTba(e.target.checked)}
            className="h-4 w-4 accent-[#2F6B34]"
          />
          <span>Show as TBA</span>
        </label>
      </div>

      <div>
        <label htmlFor={`tba-sub-${sectionKey}`} className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
          TBA Subtitle
        </label>
        <input
          id={`tba-sub-${sectionKey}`}
          type="text"
          value={sec.tbaSubtitle}
          onChange={e =>
            onUpdate(prev => ({
              ...prev,
              [sectionKey]: { ...prev[sectionKey], tbaSubtitle: e.target.value }
            }))
          }
          className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <h3 className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#1A1217]/80">
          {sectionKey === 'committees'
            ? 'Committee Rows'
            : sectionKey === 'schedule'
              ? 'Schedule Items'
              : sectionKey === 'faq'
                ? 'FAQ Entries'
                : 'Registration Blocks'}
        </h3>
        <button
          type="button"
          onClick={addItem}
          className="inline-flex min-h-[36px] items-center gap-1.5 border border-[#1A1217]/25 bg-[#EDE6D6] px-3 py-1 font-['Cinzel',serif] text-[11px] font-semibold uppercase tracking-wider"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Add Row</span>
        </button>
      </div>

      {sec.items.length === 0 ? (
        <p className="border border-[#1A1217]/15 bg-[#EDE6D6]/40 p-4 font-['Cormorant_Garamond',Georgia,serif] text-base italic text-[#1A1217]/75">
          No items added yet. Turn off "Show as TBA" once rows are ready to appear on the site.
        </p>
      ) : (
        <div className="space-y-4">
          {sec.items.map((item, idx) => (
            <div key={idx} className="border border-[#1A1217]/20 bg-[#EDE6D6]/45 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                  Entry #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  aria-label={`Remove entry ${idx + 1}`}
                  className="p-1 text-[#7C1E21] hover:opacity-75"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {sectionKey === 'committees' ? (
                <>
                  <input
                    type="text"
                    placeholder="Committee name (e.g. UNSC)"
                    value={(item as FullSiteContent['committees']['items'][number]).name}
                    onChange={e =>
                      onUpdate(prev => ({
                        ...prev,
                        committees: {
                          ...prev.committees,
                          items: prev.committees.items.map((it, i) =>
                            i === idx ? { ...it, name: e.target.value } : it
                          )
                        }
                      }))
                    }
                    className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                  />
                  <textarea
                    rows={2}
                    placeholder="Topic or details"
                    value={(item as FullSiteContent['committees']['items'][number]).details}
                    onChange={e =>
                      onUpdate(prev => ({
                        ...prev,
                        committees: {
                          ...prev.committees,
                          items: prev.committees.items.map((it, i) =>
                            i === idx ? { ...it, details: e.target.value } : it
                          )
                        }
                      }))
                    }
                    className="w-full border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-2 text-base"
                  />
                </>
              ) : null}

              {sectionKey === 'schedule' ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Date / Time (e.g. Day 1 · 09:00)"
                      value={(item as FullSiteContent['schedule']['items'][number]).dateTime}
                      onChange={e =>
                        onUpdate(prev => ({
                          ...prev,
                          schedule: {
                            ...prev.schedule,
                            items: prev.schedule.items.map((it, i) =>
                              i === idx ? { ...it, dateTime: e.target.value } : it
                            )
                          }
                        }))
                      }
                      className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                    />
                    <input
                      type="text"
                      placeholder="Session title"
                      value={(item as FullSiteContent['schedule']['items'][number]).title}
                      onChange={e =>
                        onUpdate(prev => ({
                          ...prev,
                          schedule: {
                            ...prev.schedule,
                            items: prev.schedule.items.map((it, i) =>
                              i === idx ? { ...it, title: e.target.value } : it
                            )
                          }
                        }))
                      }
                      className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Optional note or location"
                    value={(item as FullSiteContent['schedule']['items'][number]).details || ''}
                    onChange={e =>
                      onUpdate(prev => ({
                        ...prev,
                        schedule: {
                          ...prev.schedule,
                          items: prev.schedule.items.map((it, i) =>
                            i === idx ? { ...it, details: e.target.value } : it
                          )
                        }
                      }))
                    }
                    className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                  />
                </>
              ) : null}

              {sectionKey === 'faq' ? (
                <>
                  <input
                    type="text"
                    placeholder="Question"
                    value={(item as FullSiteContent['faq']['items'][number]).question}
                    onChange={e =>
                      onUpdate(prev => ({
                        ...prev,
                        faq: {
                          ...prev.faq,
                          items: prev.faq.items.map((it, i) =>
                            i === idx ? { ...it, question: e.target.value } : it
                          )
                        }
                      }))
                    }
                    className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                  />
                  <textarea
                    rows={2}
                    placeholder="Answer"
                    value={(item as FullSiteContent['faq']['items'][number]).answer}
                    onChange={e =>
                      onUpdate(prev => ({
                        ...prev,
                        faq: {
                          ...prev.faq,
                          items: prev.faq.items.map((it, i) =>
                            i === idx ? { ...it, answer: e.target.value } : it
                          )
                        }
                      }))
                    }
                    className="w-full border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-2 text-base"
                  />
                </>
              ) : null}

              {sectionKey === 'register' ? (
                <>
                  <input
                    type="text"
                    placeholder="Heading (e.g. Delegate Registration)"
                    value={(item as FullSiteContent['register']['items'][number]).title}
                    onChange={e =>
                      onUpdate(prev => ({
                        ...prev,
                        register: {
                          ...prev.register,
                          items: prev.register.items.map((it, i) =>
                            i === idx ? { ...it, title: e.target.value } : it
                          )
                        }
                      }))
                    }
                    className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                  />
                  <textarea
                    rows={2}
                    placeholder="Details or fee notes"
                    value={(item as FullSiteContent['register']['items'][number]).details}
                    onChange={e =>
                      onUpdate(prev => ({
                        ...prev,
                        register: {
                          ...prev.register,
                          items: prev.register.items.map((it, i) =>
                            i === idx ? { ...it, details: e.target.value } : it
                          )
                        }
                      }))
                    }
                    className="w-full border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-2 text-base"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Link button label (optional)"
                      value={(item as FullSiteContent['register']['items'][number]).linkLabel || ''}
                      onChange={e =>
                        onUpdate(prev => ({
                          ...prev,
                          register: {
                            ...prev.register,
                            items: prev.register.items.map((it, i) =>
                              i === idx ? { ...it, linkLabel: e.target.value } : it
                            )
                          }
                        }))
                      }
                      className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      value={(item as FullSiteContent['register']['items'][number]).linkUrl || ''}
                      onChange={e =>
                        onUpdate(prev => ({
                          ...prev,
                          register: {
                            ...prev.register,
                            items: prev.register.items.map((it, i) =>
                              i === idx ? { ...it, linkUrl: e.target.value } : it
                            )
                          }
                        }))
                      }
                      className="w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                    />
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PreviewTbaSection: React.FC<{
  sectionKey: 'committees' | 'schedule' | 'faq' | 'register';
  data: FullSiteContent;
}> = ({ sectionKey, data }) => {
  const sec = data[sectionKey];
  if (sec.showTba || sec.items.length === 0) {
    return (
      <div className="py-4">
        <p className="font-['Cinzel',serif] text-5xl font-semibold text-[#EDE6D6]">TBA</p>
        <div className="my-4 h-0.5 w-28 bg-[#4F9A57]" />
        <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg italic text-[#EDE6D6]/80">
          {sec.tbaSubtitle || 'To be announced.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sectionKey === 'committees'
        ? data.committees.items.map((c, i) => (
            <div key={i} className="border-b border-[#EDE6D6]/15 pb-3">
              <h4 className="font-['Cinzel',serif] text-base font-semibold text-[#EDE6D6]">{c.name || 'Untitled'}</h4>
              <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#EDE6D6]/80">{c.details}</p>
            </div>
          ))
        : null}
      {sectionKey === 'schedule'
        ? data.schedule.items.map((s, i) => (
            <div key={i} className="border-b border-[#EDE6D6]/15 pb-3">
              <p className="font-['Cinzel',serif] text-xs uppercase tracking-wider text-[#4F9A57]">{s.dateTime}</p>
              <h4 className="font-['Cinzel',serif] text-base font-semibold text-[#EDE6D6]">{s.title}</h4>
              {s.details ? <p className="font-['Cormorant_Garamond',Georgia,serif] text-base text-[#EDE6D6]/80">{s.details}</p> : null}
            </div>
          ))
        : null}
      {sectionKey === 'faq'
        ? data.faq.items.map((f, i) => (
            <div key={i} className="border-b border-[#EDE6D6]/15 pb-3">
              <h4 className="font-['Cinzel',serif] text-base font-semibold text-[#EDE6D6]">{f.question}</h4>
              <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#EDE6D6]/80">{f.answer}</p>
            </div>
          ))
        : null}
      {sectionKey === 'register'
        ? data.register.items.map((r, i) => (
            <div key={i} className="border-b border-[#EDE6D6]/15 pb-3">
              <h4 className="font-['Cinzel',serif] text-base font-semibold text-[#EDE6D6]">{r.title}</h4>
              <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#EDE6D6]/80">{r.details}</p>
            </div>
          ))
        : null}
    </div>
  );
};
