import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, FileText, HelpCircle, Image as ImageIcon, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';

interface ConferenceCmsViewProps {
  sb: any;
  log: (action: string, details?: Record<string, unknown>) => Promise<unknown> | unknown;
  siteContentPanel?: React.ReactNode;
}

export const ConferenceCmsView: React.FC<ConferenceCmsViewProps> = ({ sb, log, siteContentPanel }) => {
  const [subTab, setSubTab] = useState<'schedule' | 'faqs' | 'documents' | 'sponsors' | 'gallery' | 'site_content'>('schedule');
  const [days, setDays] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [newDay, setNewDay] = useState({ day_number: 1, title: '', date_label: '', published: true });
  const [newSession, setNewSession] = useState({ day_id: '', start_time: '', end_time: '', title: '', location: '', description: '', published: true });
  const [newFaq, setNewFaq] = useState({ category: 'General', question: '', answer: '', published: true });
  const [newDoc, setNewDoc] = useState({ title: '', category: 'Study Guide', file_url: '', audience: 'public', description: '', published: true });
  const [newSponsor, setNewSponsor] = useState({ name: '', tier: 'Partner', website_url: '', logo_url: '', description: '', published: true });
  const [newGallery, setNewGallery] = useState({ title: '', category: 'Conference', image_url: '', caption: '', published: true });

  const loadAll = useCallback(async () => {
    setErr('');
    const [dRes, sRes, fRes, docRes, spRes, gRes] = await Promise.all([
      sb.from('schedule_days').select('*').order('day_number').order('sort_order'),
      sb.from('schedule_sessions').select('*').order('sort_order').order('start_time'),
      sb.from('faqs').select('*').order('sort_order').order('created_at'),
      sb.from('conference_documents').select('*').order('sort_order').order('created_at'),
      sb.from('sponsors').select('*').order('sort_order').order('created_at'),
      sb.from('gallery_items').select('*').order('sort_order').order('created_at')
    ]);
    if (!dRes.error) {
      setDays(dRes.data || []);
      if (dRes.data?.[0]?.id && !newSession.day_id) {
        setNewSession(p => ({ ...p, day_id: dRes.data[0].id }));
      }
    }
    if (!sRes.error) setSessions(sRes.data || []);
    if (!fRes.error) setFaqs(fRes.data || []);
    if (!docRes.error) setDocs(docRes.data || []);
    if (!spRes.error) setSponsors(spRes.data || []);
    if (!gRes.error) setGallery(gRes.data || []);
  }, [sb, newSession.day_id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const insertRow = async (table: string, payload: Record<string, unknown>, label: string, resetFn: () => void) => {
    setErr(''); setMsg('');
    const { error } = await sb.from(table).insert(payload);
    if (error) { setErr(error.message); return; }
    await log(`cms.create.${table}`, { label });
    resetFn();
    setMsg(`Added ${label}.`);
    await loadAll();
  };

  const togglePublished = async (table: string, row: any) => {
    setErr('');
    const { error } = await sb.from(table).update({ published: !row.published }).eq('id', row.id);
    if (error) { setErr(error.message); return; }
    await log(`cms.publish.${table}`, { id: row.id, published: !row.published });
    await loadAll();
  };

  const deleteRow = async (table: string, id: string) => {
    setErr('');
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { setErr(error.message); return; }
    await log(`cms.delete.${table}`, { id });
    await loadAll();
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">WEBSITE / DATABASE-BACKED CMS</p>
          <h1>Conference Content CMS</h1>
          <p>Publish schedule days &amp; sessions, FAQs, public/staff documents, sponsors, gallery items, and site copy directly from Supabase to the public Veritas MUN homepage.</p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void loadAll()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" className={subTab === 'schedule' ? 'on' : ''} onClick={() => setSubTab('schedule')}><Calendar size={14} style={{ marginRight: 5 }} />Schedule</button>
        <button type="button" className={subTab === 'faqs' ? 'on' : ''} onClick={() => setSubTab('faqs')}><HelpCircle size={14} style={{ marginRight: 5 }} />FAQs</button>
        <button type="button" className={subTab === 'documents' ? 'on' : ''} onClick={() => setSubTab('documents')}><FileText size={14} style={{ marginRight: 5 }} />Documents</button>
        <button type="button" className={subTab === 'sponsors' ? 'on' : ''} onClick={() => setSubTab('sponsors')}><Sparkles size={14} style={{ marginRight: 5 }} />Sponsors</button>
        <button type="button" className={subTab === 'gallery' ? 'on' : ''} onClick={() => setSubTab('gallery')}><ImageIcon size={14} style={{ marginRight: 5 }} />Gallery</button>
        {siteContentPanel && (
          <button type="button" className={subTab === 'site_content' ? 'on' : ''} onClick={() => setSubTab('site_content')}>Site Copy</button>
        )}
      </div>

      {msg && <div className="msg" role="status" style={{ fontWeight: 600 }}>{msg}</div>}
      {err && <div className="err" role="alert">{err}</div>}

      {subTab === 'schedule' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form
            className="admin-panel"
            onSubmit={e => {
              e.preventDefault();
              void insertRow('schedule_days', { ...newDay, title: newDay.title.trim(), sort_order: days.length }, 'schedule day', () =>
                setNewDay({ day_number: days.length + 2, title: '', date_label: '', published: true })
              );
            }}
          >
            <p className="admin-kicker">ADD SCHEDULE DAY</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input type="number" min={1} value={newDay.day_number} onChange={e => setNewDay(p => ({ ...p, day_number: Number(e.target.value) || 1 }))} style={{ width: 90 }} />
              <input required placeholder="Day title (e.g. Day One — Opening)" value={newDay.title} onChange={e => setNewDay(p => ({ ...p, title: e.target.value }))} />
              <input placeholder="Date label (e.g. Oct 16, 2027)" value={newDay.date_label} onChange={e => setNewDay(p => ({ ...p, date_label: e.target.value }))} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={newDay.published} onChange={e => setNewDay(p => ({ ...p, published: e.target.checked }))} />
                Published
              </label>
              <button type="submit" className="btn"><Plus size={14} /> Add Day</button>
            </div>
          </form>

          {days.length > 0 && (
            <form
              className="admin-panel"
              onSubmit={e => {
                e.preventDefault();
                void insertRow('schedule_sessions', { ...newSession, title: newSession.title.trim(), sort_order: sessions.length }, 'schedule session', () =>
                  setNewSession(p => ({ ...p, start_time: '', end_time: '', title: '', location: '', description: '' }))
                );
              }}
            >
              <p className="admin-kicker">ADD SESSION TO DAY</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                <select required value={newSession.day_id} onChange={e => setNewSession(p => ({ ...p, day_id: e.target.value }))}>
                  <option value="">Select day...</option>
                  {days.map(d => <option key={d.id} value={d.id}>Day {d.day_number}: {d.title}</option>)}
                </select>
                <input required placeholder="Session title" value={newSession.title} onChange={e => setNewSession(p => ({ ...p, title: e.target.value }))} />
                <input placeholder="Start (e.g. 09:00)" value={newSession.start_time} onChange={e => setNewSession(p => ({ ...p, start_time: e.target.value }))} />
                <input placeholder="End (e.g. 10:30)" value={newSession.end_time} onChange={e => setNewSession(p => ({ ...p, end_time: e.target.value }))} />
                <input placeholder="Location" value={newSession.location} onChange={e => setNewSession(p => ({ ...p, location: e.target.value }))} />
              </div>
              <button type="submit" className="btn" style={{ marginTop: 10 }}>Add Session</button>
            </form>
          )}

          {days.map(day => (
            <section className="admin-panel" key={day.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <strong>Day {day.day_number}: {day.title}</strong> {day.date_label ? `(${day.date_label})` : ''}
                </div>
                <div className="toolbar" style={{ margin: 0 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={day.published} onChange={() => void togglePublished('schedule_days', day)} />
                    Published
                  </label>
                  <button type="button" className="btn red" onClick={() => void deleteRow('schedule_days', day.id)}><Trash2 size={13} /></button>
                </div>
              </div>
              {sessions.filter(s => s.day_id === day.id).map(s => (
                <div key={s.id} className="admin-activity-row" style={{ alignItems: 'center' }}>
                  <span>{s.start_time}{s.end_time ? `–${s.end_time}` : ''} · <strong>{s.title}</strong> {s.location ? `(${s.location})` : ''}</span>
                  <div className="toolbar" style={{ margin: 0 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={s.published} onChange={() => void togglePublished('schedule_sessions', s)} /> Pub
                    </label>
                    <button type="button" className="btn red" onClick={() => void deleteRow('schedule_sessions', s.id)}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {subTab === 'faqs' && (
        <>
          <form
            className="admin-panel"
            onSubmit={e => {
              e.preventDefault();
              void insertRow('faqs', { ...newFaq, question: newFaq.question.trim(), answer: newFaq.answer.trim(), sort_order: faqs.length }, 'FAQ item', () =>
                setNewFaq({ category: 'General', question: '', answer: '', published: true })
              );
            }}
          >
            <p className="admin-kicker">ADD FAQ</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <input placeholder="Category" value={newFaq.category} onChange={e => setNewFaq(p => ({ ...p, category: e.target.value }))} />
              <input required placeholder="Question" value={newFaq.question} onChange={e => setNewFaq(p => ({ ...p, question: e.target.value }))} />
            </div>
            <textarea required placeholder="Answer" value={newFaq.answer} onChange={e => setNewFaq(p => ({ ...p, answer: e.target.value }))} style={{ marginTop: 10, minHeight: 74 }} />
            <button type="submit" className="btn" style={{ marginTop: 10 }}>Add FAQ</button>
          </form>
          <div className="tw">
            <table>
              <thead><tr><th>Category</th><th>Question &amp; Answer</th><th>Published</th><th /></tr></thead>
              <tbody>
                {faqs.map(f => (
                  <tr key={f.id}>
                    <td>{f.category}</td>
                    <td><strong>{f.question}</strong><div style={{ fontSize: 12, opacity: 0.78 }}>{f.answer}</div></td>
                    <td><input type="checkbox" checked={f.published} onChange={() => void togglePublished('faqs', f)} /></td>
                    <td><button type="button" className="btn red" onClick={() => void deleteRow('faqs', f.id)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'documents' && (
        <>
          <form
            className="admin-panel"
            onSubmit={e => {
              e.preventDefault();
              void insertRow('conference_documents', { ...newDoc, title: newDoc.title.trim(), sort_order: docs.length }, 'document', () =>
                setNewDoc({ title: '', category: 'Study Guide', file_url: '', audience: 'public', description: '', published: true })
              );
            }}
          >
            <p className="admin-kicker">ADD CONFERENCE DOCUMENT / STUDY GUIDE</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <input required placeholder="Title" value={newDoc.title} onChange={e => setNewDoc(p => ({ ...p, title: e.target.value }))} />
              <input placeholder="Category (Study Guide, Handbook)" value={newDoc.category} onChange={e => setNewDoc(p => ({ ...p, category: e.target.value }))} />
              <input required placeholder="https://... file URL" value={newDoc.file_url} onChange={e => setNewDoc(p => ({ ...p, file_url: e.target.value }))} />
              <select value={newDoc.audience} onChange={e => setNewDoc(p => ({ ...p, audience: e.target.value }))}>
                <option value="public">Public Website</option>
                <option value="staff">Staff Only</option>
                <option value="eb">EB / Heads Only</option>
              </select>
            </div>
            <button type="submit" className="btn" style={{ marginTop: 10 }}>Add Document</button>
          </form>
          <div className="tw">
            <table>
              <thead><tr><th>Title</th><th>Category</th><th>Audience</th><th>Published</th><th /></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td><strong>{d.title}</strong><div style={{ fontSize: 12, opacity: 0.78 }}>{d.file_url}</div></td>
                    <td>{d.category}</td>
                    <td>{d.audience}</td>
                    <td><input type="checkbox" checked={d.published} onChange={() => void togglePublished('conference_documents', d)} /></td>
                    <td><button type="button" className="btn red" onClick={() => void deleteRow('conference_documents', d.id)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'sponsors' && (
        <>
          <form
            className="admin-panel"
            onSubmit={e => {
              e.preventDefault();
              void insertRow('sponsors', { ...newSponsor, name: newSponsor.name.trim(), sort_order: sponsors.length }, 'sponsor', () =>
                setNewSponsor({ name: '', tier: 'Partner', website_url: '', logo_url: '', description: '', published: true })
              );
            }}
          >
            <p className="admin-kicker">ADD SPONSOR / PARTNER</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <input required placeholder="Sponsor name" value={newSponsor.name} onChange={e => setNewSponsor(p => ({ ...p, name: e.target.value }))} />
              <input placeholder="Tier (Gold, Partner)" value={newSponsor.tier} onChange={e => setNewSponsor(p => ({ ...p, tier: e.target.value }))} />
              <input placeholder="Website URL" value={newSponsor.website_url} onChange={e => setNewSponsor(p => ({ ...p, website_url: e.target.value }))} />
              <input placeholder="Logo URL" value={newSponsor.logo_url} onChange={e => setNewSponsor(p => ({ ...p, logo_url: e.target.value }))} />
            </div>
            <button type="submit" className="btn" style={{ marginTop: 10 }}>Add Sponsor</button>
          </form>
          <div className="tw">
            <table>
              <thead><tr><th>Sponsor</th><th>Tier</th><th>Published</th><th /></tr></thead>
              <tbody>
                {sponsors.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.name}</strong><div style={{ fontSize: 12, opacity: 0.78 }}>{s.website_url}</div></td>
                    <td>{s.tier}</td>
                    <td><input type="checkbox" checked={s.published} onChange={() => void togglePublished('sponsors', s)} /></td>
                    <td><button type="button" className="btn red" onClick={() => void deleteRow('sponsors', s.id)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'gallery' && (
        <>
          <form
            className="admin-panel"
            onSubmit={e => {
              e.preventDefault();
              void insertRow('gallery_items', { ...newGallery, title: newGallery.title.trim(), sort_order: gallery.length }, 'gallery item', () =>
                setNewGallery({ title: '', category: 'Conference', image_url: '', caption: '', published: true })
              );
            }}
          >
            <p className="admin-kicker">ADD GALLERY ITEM</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <input required placeholder="Photo title" value={newGallery.title} onChange={e => setNewGallery(p => ({ ...p, title: e.target.value }))} />
              <input placeholder="Category" value={newGallery.category} onChange={e => setNewGallery(p => ({ ...p, category: e.target.value }))} />
              <input required placeholder="Image URL" value={newGallery.image_url} onChange={e => setNewGallery(p => ({ ...p, image_url: e.target.value }))} />
              <input placeholder="Caption" value={newGallery.caption} onChange={e => setNewGallery(p => ({ ...p, caption: e.target.value }))} />
            </div>
            <button type="submit" className="btn" style={{ marginTop: 10 }}>Add Gallery Item</button>
          </form>
          <div className="tw">
            <table>
              <thead><tr><th>Title</th><th>Category</th><th>Published</th><th /></tr></thead>
              <tbody>
                {gallery.map(g => (
                  <tr key={g.id}>
                    <td><strong>{g.title}</strong><div style={{ fontSize: 12, opacity: 0.78 }}>{g.caption}</div></td>
                    <td>{g.category}</td>
                    <td><input type="checkbox" checked={g.published} onChange={() => void togglePublished('gallery_items', g)} /></td>
                    <td><button type="button" className="btn red" onClick={() => void deleteRow('gallery_items', g.id)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'site_content' && siteContentPanel}
    </div>
  );
};
