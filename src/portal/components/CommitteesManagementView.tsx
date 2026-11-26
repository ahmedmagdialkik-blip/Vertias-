import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, Image as ImageIcon, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  buildCommitteeLogoStoragePath,
  moveCommitteeOrder,
  normalizeCommitteeRows,
  sanitizeCommitteeLogoUrl,
  validateCommitteeInput,
  type CommitteeRecord
} from '../../utils/committeesAndSettingsLogic';

interface CommitteesManagementViewProps {
  sb: any;
  log: (action: string, details?: Record<string, unknown>) => Promise<unknown> | unknown;
  assetsBucket?: string;
}

interface CommitteeDraft {
  id: string | null;
  name: string;
  abbreviation: string;
  chamber: string;
  difficulty: string;
  capacity: number;
  chair_name: string;
  vice_chair_name: string;
  topicsText: string;
  description: string;
  image_url: string;
  enabled: boolean;
}

const EMPTY_DRAFT: CommitteeDraft = {
  id: null,
  name: '',
  abbreviation: '',
  chamber: 'General Assembly',
  difficulty: 'Intermediate',
  capacity: 30,
  chair_name: '',
  vice_chair_name: '',
  topicsText: '',
  description: '',
  image_url: '',
  enabled: true
};

export const CommitteesManagementView: React.FC<CommitteesManagementViewProps> = ({
  sb,
  log,
  assetsBucket = 'team-photos'
}) => {
  const [committees, setCommittees] = useState<CommitteeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<CommitteeDraft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<CommitteeRecord | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadCommittees = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await sb
      .from('committees')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      setErr(error.message || 'Could not load committees.');
      setCommittees([]);
    } else {
      setCommittees(normalizeCommitteeRows(data));
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void loadCommittees();
  }, [loadCommittees]);

  const openCreateForm = () => {
    setErr('');
    setMsg('');
    setDraft(EMPTY_DRAFT);
    setFormOpen(true);
  };

  const openEditForm = (item: CommitteeRecord) => {
    setErr('');
    setMsg('');
    setDraft({
      id: item.id,
      name: item.name,
      abbreviation: item.abbreviation || '',
      chamber: item.chamber || 'General Assembly',
      difficulty: item.difficulty || 'Intermediate',
      capacity: item.capacity || 30,
      chair_name: item.chair_name || '',
      vice_chair_name: item.vice_chair_name || '',
      topicsText: Array.isArray(item.topics) ? item.topics.join('\n') : '',
      description: item.description,
      image_url: item.image_url,
      enabled: item.enabled
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setDraft(EMPTY_DRAFT);
    setErr('');
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setErr('');
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) {
      setErr('Please upload a PNG, JPG, WEBP, or GIF image for the committee logo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr('Committee image must be 5 MB or smaller.');
      return;
    }
    setUploadingImage(true);
    try {
      const storagePath = buildCommitteeLogoStoragePath(draft.name || 'committee', file.name);
      const { error: upErr } = await sb.storage.from(assetsBucket).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      });
      if (upErr) {
        setErr(upErr.message || 'Could not upload committee image.');
        return;
      }
      const { data: pubData } = sb.storage.from(assetsBucket).getPublicUrl(storagePath);
      const publicUrl = sanitizeCommitteeLogoUrl(pubData?.publicUrl || '');
      if (!publicUrl) {
        setErr('Uploaded image did not return a valid public URL.');
        return;
      }
      setDraft(prev => ({ ...prev, image_url: publicUrl }));
      setMsg('Committee image uploaded. Save changes to publish.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    const issue = validateCommitteeInput(draft);
    if (issue) {
      setErr(issue);
      return;
    }

    setSaving(true);
    const parsedTopics = draft.topicsText
      .split(/\r?\n/)
      .map(t => t.trim())
      .filter(Boolean);
    const payload = {
      name: draft.name.trim(),
      abbreviation: draft.abbreviation.trim(),
      chamber: draft.chamber.trim() || 'General Assembly',
      difficulty: draft.difficulty.trim() || 'Intermediate',
      capacity: Math.max(1, Math.min(500, Number(draft.capacity) || 30)),
      chair_name: draft.chair_name.trim(),
      vice_chair_name: draft.vice_chair_name.trim(),
      topics: parsedTopics,
      description: draft.description.trim(),
      image_url: sanitizeCommitteeLogoUrl(draft.image_url),
      enabled: Boolean(draft.enabled)
    };

    try {
      if (draft.id) {
        const { error } = await sb
          .from('committees')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', draft.id);
        if (error) {
          setErr(error.message || 'Could not update committee.');
          return;
        }
        await log('committees.update', { id: draft.id, name: payload.name, enabled: payload.enabled });
        setMsg(`Updated "${payload.name}".`);
      } else {
        const maxOrder = committees.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), -1);
        const { error } = await sb.from('committees').insert({
          ...payload,
          sort_order: maxOrder + 1
        });
        if (error) {
          setErr(error.message || 'Could not create committee.');
          return;
        }
        await log('committees.create', { name: payload.name, enabled: payload.enabled });
        setMsg(`Added "${payload.name}".`);
      }
      setFormOpen(false);
      setDraft(EMPTY_DRAFT);
      await loadCommittees();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (item: CommitteeRecord) => {
    setErr('');
    setMsg('');
    const nextEnabled = !item.enabled;
    const { error } = await sb
      .from('committees')
      .update({ enabled: nextEnabled, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) {
      setErr(error.message || 'Could not update committee visibility.');
      return;
    }
    setCommittees(prev => prev.map(row => (row.id === item.id ? { ...row, enabled: nextEnabled } : row)));
    await log('committees.toggle', { id: item.id, name: item.name, enabled: nextEnabled });
    setMsg(`"${item.name}" is now ${nextEnabled ? 'enabled' : 'disabled'}.`);
  };

  const handleMove = async (item: CommitteeRecord, direction: 'up' | 'down') => {
    setErr('');
    setMsg('');
    const reordered = moveCommitteeOrder(committees, item.id, direction);
    setCommittees(reordered);

    for (const row of reordered) {
      const { error } = await sb
        .from('committees')
        .update({ sort_order: row.sort_order, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) {
        setErr(error.message || 'Could not save new committee order.');
        await loadCommittees();
        return;
      }
    }

    await log('committees.reorder', { id: item.id, name: item.name, direction });
    setMsg(`Updated order for "${item.name}".`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      const { error } = await sb.from('committees').delete().eq('id', deleteTarget.id);
      if (error) {
        setErr(error.message || 'Could not delete committee.');
        return;
      }
      await log('committees.delete', { id: deleteTarget.id, name: deleteTarget.name });
      setMsg(`Deleted "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await loadCommittees();
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = committees.filter(c => c.enabled).length;

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">WEBSITE / COMMITTEES</p>
          <h1>Committees Management</h1>
          <p>Add, edit, reorder, enable or disable, and remove the committees displayed on the public Veritas MUN website.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button type="button" className="btn ghost" onClick={() => void loadCommittees()}>
            Refresh
          </button>
          <button type="button" className="btn" onClick={openCreateForm}>
            <Plus size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Add committee
          </button>
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Total committees</span>
          </div>
          <strong className="admin-stat-value">{committees.length}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Enabled on homepage</span>
          </div>
          <strong className="admin-stat-value">{enabledCount}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Disabled / draft</span>
          </div>
          <strong className="admin-stat-value">{committees.length - enabledCount}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Homepage fallback</span>
          </div>
          <strong className="admin-stat-value" style={{ fontSize: 18 }}>
            {enabledCount > 0 ? 'Live list' : 'TBA'}
          </strong>
        </div>
      </div>

      {msg && (
        <div className="msg" role="status" style={{ fontWeight: 600 }}>
          {msg}
        </div>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}

      {formOpen && (
        <form className="admin-panel" onSubmit={handleSave} aria-label={draft.id ? 'Edit committee form' : 'Add committee form'}>
          <div className="admin-filter-heading">
            <div>
              <p className="admin-kicker">{draft.id ? 'EDIT COMMITTEE' : 'NEW COMMITTEE'}</p>
              <h2 style={{ margin: 0 }}>{draft.id ? `Edit "${draft.name}"` : 'Add new committee'}</h2>
            </div>
            <button type="button" className="btn ghost" onClick={closeForm} aria-label="Close committee editor">
              <X size={15} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            <div className="field">
              <label htmlFor="committee-name">
                Committee name<span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="committee-name"
                required
                value={draft.name}
                onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., United Nations Security Council"
              />
            </div>

            <div className="field">
              <label htmlFor="committee-abbr">Abbreviation</label>
              <input
                id="committee-abbr"
                value={draft.abbreviation}
                onChange={e => setDraft(prev => ({ ...prev, abbreviation: e.target.value }))}
                placeholder="e.g., UNSC"
              />
            </div>

            <div className="field">
              <label htmlFor="committee-chamber">Chamber / Council Type</label>
              <select
                id="committee-chamber"
                value={draft.chamber}
                onChange={e => setDraft(prev => ({ ...prev, chamber: e.target.value }))}
              >
                <option>General Assembly</option>
                <option>Security Council</option>
                <option>Specialized Agency</option>
                <option>Crisis Committee</option>
                <option>ECOSOC & Regional</option>
                <option>Judicial / ICJ</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="committee-difficulty">Difficulty</label>
              <select
                id="committee-difficulty"
                value={draft.difficulty}
                onChange={e => setDraft(prev => ({ ...prev, difficulty: e.target.value }))}
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
                <option>Crisis / Expert</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="committee-capacity">Delegate Capacity</label>
              <input
                id="committee-capacity"
                type="number"
                min={1}
                max={500}
                value={draft.capacity}
                onChange={e => setDraft(prev => ({ ...prev, capacity: Number(e.target.value) || 30 }))}
              />
            </div>

            <div className="field">
              <label htmlFor="committee-chair">Chair</label>
              <input
                id="committee-chair"
                value={draft.chair_name}
                onChange={e => setDraft(prev => ({ ...prev, chair_name: e.target.value }))}
                placeholder="Head Chair name"
              />
            </div>

            <div className="field">
              <label htmlFor="committee-vice-chair">Co-Chair / Vice Chair</label>
              <input
                id="committee-vice-chair"
                value={draft.vice_chair_name}
                onChange={e => setDraft(prev => ({ ...prev, vice_chair_name: e.target.value }))}
                placeholder="Vice Chair name"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="committee-topics">Agenda Topics (one topic per line)</label>
            <textarea
              id="committee-topics"
              value={draft.topicsText}
              onChange={e => setDraft(prev => ({ ...prev, topicsText: e.target.value }))}
              placeholder={'Topic A: Maritime Security in the Red Sea\nTopic B: Non-Proliferation Frameworks'}
              style={{ minHeight: 74 }}
            />
          </div>

          <div className="field">
            <label htmlFor="committee-desc">
              Committee description<span className="req" aria-hidden="true">*</span>
            </label>
            <textarea
              id="committee-desc"
              required
              value={draft.description}
              onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Topic overview, agenda focus, and delegate council mandate..."
              style={{ minHeight: 110 }}
            />
          </div>

          <div className="field">
            <label htmlFor="committee-image-url">Committee logo or image (optional)</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                id="committee-image-url"
                value={draft.image_url}
                onChange={e => setDraft(prev => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://... or upload an image file"
                style={{ flex: '1 1 280px' }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleImageUpload(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn ghost"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                {uploadingImage ? 'Uploading...' : 'Upload logo'}
              </button>
              {draft.image_url && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setDraft(prev => ({ ...prev, image_url: '' }))}
                >
                  Clear image
                </button>
              )}
            </div>
            {sanitizeCommitteeLogoUrl(draft.image_url) && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src={sanitizeCommitteeLogoUrl(draft.image_url)}
                  alt="Committee logo preview"
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: 'contain',
                    background: '#1A1217',
                    border: '1px solid #BAB1A0',
                    borderRadius: 6,
                    padding: 6
                  }}
                />
                <span style={{ fontSize: 12, color: '#61575A' }}>Logo preview</span>
              </div>
            )}
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={e => setDraft(prev => ({ ...prev, enabled: e.target.checked }))}
            />
            <span>Enable committee on public homepage</span>
          </label>

          <div className="toolbar" style={{ margin: 0 }}>
            <button type="submit" className="btn" disabled={saving || uploadingImage}>
              <Check size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {saving ? 'Saving...' : draft.id ? 'Save committee changes' : 'Create committee'}
            </button>
            <button type="button" className="btn ghost" disabled={saving} onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {deleteTarget && (
        <div
          className="admin-panel"
          role="dialog"
          aria-modal="false"
          aria-label={`Confirm deletion of ${deleteTarget.name}`}
          style={{ borderColor: '#8A2B2B', background: '#FBF3F1' }}
        >
          <p className="admin-kicker" style={{ color: '#6B1F1F' }}>CONFIRM DELETION</p>
          <h3 style={{ margin: '0 0 6px' }}>Delete &ldquo;{deleteTarget.name}&rdquo;?</h3>
          <p style={{ margin: '0 0 14px' }}>
            This permanently removes the committee from Supabase and from the public homepage.
          </p>
          <div className="toolbar" style={{ margin: 0 }}>
            <button type="button" className="btn red" disabled={saving} onClick={() => void confirmDelete()}>
              Confirm delete
            </button>
            <button type="button" className="btn ghost" disabled={saving} onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-panel">Loading committees...</div>
      ) : committees.length === 0 ? (
        <div className="admin-empty-state">
          <ImageIcon size={26} strokeWidth={1.6} />
          <strong>No committees added yet</strong>
          <p>While no enabled committees exist, the public Committees section shows &ldquo;TBA&rdquo;. Add a committee to publish it.</p>
          <button type="button" className="btn" onClick={openCreateForm} style={{ marginTop: 8 }}>
            <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Add first committee
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {committees.map((item, idx) => {
            const safeLogo = sanitizeCommitteeLogoUrl(item.image_url);
            return (
              <article
                key={item.id}
                className="admin-panel"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: '1 1 360px', minWidth: 0 }}>
                  {safeLogo ? (
                    <img
                      src={safeLogo}
                      alt={`${item.name} logo`}
                      style={{
                        width: 58,
                        height: 58,
                        objectFit: 'contain',
                        background: '#1A1217',
                        borderRadius: 8,
                        border: '1px solid #BAB1A0',
                        padding: 6,
                        flexShrink: 0
                      }}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 8,
                        border: '1px dashed #BAB1A0',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#756B64',
                        flexShrink: 0
                      }}
                    >
                      <ImageIcon size={20} />
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="admin-kicker" style={{ margin: '0 !important' }}>#{idx + 1}</span>
                      <h3 style={{ margin: 0 }}>
                        {item.name}
                        {item.abbreviation ? ` (${item.abbreviation})` : ''}
                      </h3>
                      <span className={item.enabled ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                        {item.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      {item.chamber && <span className="badge" style={{ marginLeft: 0 }}>{item.chamber}</span>}
                      {item.difficulty && <span className="badge" style={{ marginLeft: 0 }}>{item.difficulty}</span>}
                      {item.capacity ? <span className="badge" style={{ marginLeft: 0 }}>{item.capacity} seats</span> : null}
                    </div>
                    {(item.chair_name || item.vice_chair_name) && (
                      <div style={{ fontSize: 13, color: '#51464A', marginTop: 4 }}>
                        {item.chair_name ? `Chair: ${item.chair_name}` : ''}
                        {item.chair_name && item.vice_chair_name ? ' · ' : ''}
                        {item.vice_chair_name ? `Co-Chair: ${item.vice_chair_name}` : ''}
                      </div>
                    )}
                    <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{item.description}</p>
                    {Array.isArray(item.topics) && item.topics.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 13, color: '#1F4A25' }}>
                        <strong>Topics:</strong> {item.topics.join(' | ')}
                      </div>
                    )}
                  </div>
                </div>

                <div className="toolbar" style={{ margin: 0, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={idx === 0}
                    aria-label={`Move ${item.name} up`}
                    onClick={() => void handleMove(item, 'up')}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={idx === committees.length - 1}
                    aria-label={`Move ${item.name} down`}
                    onClick={() => void handleMove(item, 'down')}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}
                    onClick={() => void handleToggleEnabled(item)}
                  >
                    {item.enabled ? <EyeOff size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} /> : <Eye size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />}
                    {item.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => openEditForm(item)}
                  >
                    <Pencil size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn red"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => setDeleteTarget(item)}
                  >
                    <Trash2 size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
