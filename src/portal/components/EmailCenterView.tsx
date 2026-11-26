import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, FileText, Mail, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { buildGmailComposeUrl, interpolateEmailTemplate } from '../../utils/managementLogic';
import { invokeEdgeFunction } from './invokeEdgeFunction';

interface EmailCenterViewProps {
  sb: any;
  me: any;
  log: (action: string, details?: Record<string, unknown>) => Promise<unknown> | unknown;
}

export const EmailCenterView: React.FC<EmailCenterViewProps> = ({ sb, me, log }) => {
  const [subTab, setSubTab] = useState<'compose' | 'templates' | 'sent' | 'failed'>('compose');
  const [templates, setTemplates] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [confirmations, setConfirmations] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [resendConfigured, setResendConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Custom email / batch form
  const [selectedTplKey, setSelectedTplKey] = useState('application_accepted');
  const [customTo, setCustomTo] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);

  // Manual "Mark as Sent" note per delivery
  const [manualNoteById, setManualNoteById] = useState<Record<string, string>>({});

  // Template editor state
  const [editingTpl, setEditingTpl] = useState<any | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [tplRes, delRes, confRes, appRes, provRes] = await Promise.all([
      sb.from('email_templates').select('*').order('template_key'),
      sb.from('email_deliveries').select('*').order('created_at', { ascending: false }).limit(120),
      sb.from('email_manual_confirmations').select('*').order('confirmed_at', { ascending: false }).limit(60),
      sb
        .from('applications')
        .select('id, full_name, email, track, status, decision_note, email_status, email_sent_at')
        .in('status', ['accepted', 'rejected', 'waitlisted'])
        .order('created_at', { ascending: false }),
      invokeEdgeFunction<{ resend_configured?: boolean }>(sb, 'veritas-email', {
        action: 'provider_status'
      })
    ]);

    if (tplRes.error) setErr(tplRes.error.message);
    else setTemplates(tplRes.data || []);

    if (!delRes.error) setDeliveries(delRes.data || []);
    if (!confRes.error) setConfirmations(confRes.data || []);
    if (!appRes.error) setApps(appRes.data || []);

    if (provRes.data && typeof provRes.data.resend_configured === 'boolean') {
      setResendConfigured(provRes.data.resend_configured);
    } else {
      setResendConfigured(false);
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const applyTemplateToComposer = (tplKey: string) => {
    setSelectedTplKey(tplKey);
    const t = templates.find(x => x.template_key === tplKey);
    if (!t) return;
    setCustomSubject(
      interpolateEmailTemplate(t.subject, {
        full_name: customName || 'Recipient',
        department: 'Veritas MUN',
        email: customTo,
        note: ''
      })
    );
    setCustomBody(
      interpolateEmailTemplate(t.body_text, {
        full_name: customName || 'Recipient',
        department: 'Veritas MUN',
        email: customTo,
        note: ''
      })
    );
  };

  const sentDeliveries = useMemo(() => deliveries.filter(d => d.status === 'sent'), [deliveries]);
  const failedOrQueuedDeliveries = useMemo(
    () => deliveries.filter(d => d.status === 'failed' || d.status === 'queued'),
    [deliveries]
  );

  const handleSendSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const to = customTo.trim().toLowerCase();
    if (!to || !customSubject.trim() || !customBody.trim()) {
      setErr('Recipient email, subject, and message body are required.');
      return;
    }

    setBusy(true);
    try {
      const res = await invokeEdgeFunction<{
        ok?: boolean;
        delivery?: any;
        resend_configured?: boolean;
        error?: string;
      }>(sb, 'veritas-email', {
        action: 'send_email',
        recipient_email: to,
        recipient_name: customName.trim(),
        subject: customSubject.trim(),
        body_text: customBody.trim(),
        template_key: selectedTplKey
      });

      if (res.isEdgeUnavailable) {
        // Persist cleanly in email_deliveries as failed/queued so Manual Gmail + Mark as Sent still works end-to-end
        const { error: insErr } = await sb.from('email_deliveries').insert({
          recipient_email: to,
          recipient_name: customName.trim(),
          subject: customSubject.trim(),
          body_text: customBody.trim(),
          template_key: selectedTplKey,
          status: 'failed',
          provider: 'resend',
          error_message:
            'veritas-email Edge Function is not deployed yet. Open in Gmail and click Mark as Sent once dispatched.',
          attempts: 1,
          sent_by: me.id
        });
        if (insErr) {
          setErr(insErr.message);
          return;
        }
        setMsg('Saved to Failed / Manual Gmail queue because veritas-email Edge Function is not yet reachable.');
        setSubTab('failed');
        await loadAll();
        return;
      }

      if (res.data?.ok) {
        setMsg(`Email delivered to ${to} via Resend.`);
        setCustomTo('');
        setCustomName('');
      } else {
        setErr(
          res.data?.error ||
            res.error ||
            'Automatic sending failed. You can dispatch it via Open in Gmail & Mark as Sent in the Failed tab.'
        );
        setSubTab('failed');
      }
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleBatchDecisionSend = async () => {
    if (!selectedAppIds.length) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const res = await invokeEdgeFunction<{ ok?: boolean; results?: any[]; resend_configured?: boolean }>(
        sb,
        'veritas-email',
        {
          action: 'send_application_decision_batch',
          application_ids: selectedAppIds
        }
      );

      if (res.isEdgeUnavailable) {
        // Create queued records directly for manual Gmail fallback
        const tplMap = new Map(templates.map(t => [t.template_key, t]));
        const selectedApps = apps.filter(a => selectedAppIds.includes(a.id));
        for (const app of selectedApps) {
          const tplKey =
            app.status === 'accepted'
              ? 'application_accepted'
              : app.status === 'waitlisted'
                ? 'application_waitlisted'
                : 'application_rejected';
          const tpl = tplMap.get(tplKey);
          const vars = {
            full_name: app.full_name,
            department: app.track || 'Department',
            email: app.email,
            note: app.decision_note || ''
          };
          await sb.from('email_deliveries').insert({
            application_id: app.id,
            template_key: tplKey,
            recipient_email: app.email,
            recipient_name: app.full_name,
            subject: interpolateEmailTemplate(tpl?.subject || `Veritas MUN — ${app.track} Update`, vars),
            body_text: interpolateEmailTemplate(
              tpl?.body_text || `Dear ${app.full_name},\n\nYour application status is: ${app.status}.`,
              vars
            ),
            status: 'failed',
            provider: 'resend',
            error_message: 'Resend not configured yet — use Open in Gmail + Mark as Sent.',
            attempts: 1,
            sent_by: me.id
          });
        }
        setSelectedAppIds([]);
        setMsg(`Prepared ${selectedApps.length} decision email(s) in the Failed / Manual Gmail tab.`);
        setSubTab('failed');
        await loadAll();
        return;
      }

      const sentN = (res.data?.results || []).filter(r => r.status === 'sent').length;
      const failN = (res.data?.results || []).length - sentN;
      setSelectedAppIds([]);
      setMsg(`Batch processed: ${sentN} sent automatically, ${failN} moved to Failed / Manual Gmail.`);
      if (failN > 0) setSubTab('failed');
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (deliveryId: string) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ ok?: boolean }>(sb, 'veritas-email', {
        action: 'retry_delivery',
        delivery_id: deliveryId
      });
      if (error || !data?.ok) {
        setErr(error || 'Retry failed. Ensure RESEND_API_KEY and EMAIL_FROM are configured, or use Open in Gmail.');
      } else {
        setMsg('Email resent successfully via Resend.');
      }
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleMarkManuallySent = async (deliveryId: string) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { error } = await sb.rpc('mark_email_manually_sent', {
        p_delivery_id: deliveryId,
        p_note: manualNoteById[deliveryId] || 'Sent manually via Gmail'
      });
      if (error) {
        setErr(error.message || 'Could not record manual confirmation.');
        return;
      }
      setMsg('Confirmed manual Gmail delivery and updated audit trail.');
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTpl) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { error } = await sb
        .from('email_templates')
        .update({
          name: editingTpl.name,
          subject: editingTpl.subject,
          body_text: editingTpl.body_text,
          updated_by: me.id
        })
        .eq('id', editingTpl.id);
      if (error) {
        setErr(error.message);
        return;
      }
      await log('email_template_updated', { template_key: editingTpl.template_key });
      setEditingTpl(null);
      setMsg(`Saved template "${editingTpl.name}".`);
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">COMMUNICATIONS / EMAIL CENTER</p>
          <h1>Email Center &amp; Manual Gmail Fallback</h1>
          <p>
            Manage Postgres email templates, dispatch decision emails via Resend when configured, or open failed messages in Gmail and confirm delivery with Mark as Sent.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void loadAll()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Resend Provider</span>
            <Send className="admin-stat-icon" size={17} />
          </div>
          <div style={{ marginTop: 10 }}>
            <span className={resendConfigured ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
              {resendConfigured ? 'Configured' : 'Manual Gmail Fallback'}
            </span>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Sent Deliveries</span>
            <CheckCircle2 className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{sentDeliveries.length}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Failed / Needs Gmail</span>
            <AlertTriangle className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{failedOrQueuedDeliveries.length}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Templates</span>
            <FileText className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{templates.length}</strong>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Email center views">
        <button type="button" className={subTab === 'compose' ? 'on' : ''} onClick={() => setSubTab('compose')}>
          Queue &amp; Compose
        </button>
        <button type="button" className={subTab === 'failed' ? 'on' : ''} onClick={() => setSubTab('failed')}>
          Failed &amp; Manual Gmail ({failedOrQueuedDeliveries.length})
        </button>
        <button type="button" className={subTab === 'sent' ? 'on' : ''} onClick={() => setSubTab('sent')}>
          Sent History ({sentDeliveries.length})
        </button>
        <button type="button" className={subTab === 'templates' ? 'on' : ''} onClick={() => setSubTab('templates')}>
          Templates ({templates.length})
        </button>
      </div>

      {msg && <div className="msg" role="status" style={{ fontWeight: 600 }}>{msg}</div>}
      {err && <div className="err" role="alert">{err}</div>}

      {subTab === 'compose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="admin-panel" aria-label="Batch decision email dispatch">
            <div className="admin-filter-heading">
              <div>
                <p className="admin-kicker">1. DECIDED APPLICANTS EMAIL QUEUE</p>
                <h2 style={{ margin: 0 }}>Send Decision Notifications</h2>
              </div>
              {selectedAppIds.length > 0 && (
                <button type="button" className="btn" disabled={busy} onClick={() => void handleBatchDecisionSend()}>
                  <Send size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Dispatch Selected ({selectedAppIds.length})
                </button>
              )}
            </div>
            {loading ? (
              <p>Loading decided applications...</p>
            ) : apps.length === 0 ? (
              <p style={{ margin: 0 }}>No accepted, waitlisted, or rejected applications awaiting emails yet.</p>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th />
                      <th>Applicant</th>
                      <th>Track</th>
                      <th>Decision</th>
                      <th>Email Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.slice(0, 40).map(a => (
                      <tr key={a.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedAppIds.includes(a.id)}
                            onChange={() =>
                              setSelectedAppIds(prev =>
                                prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id]
                              )
                            }
                            aria-label={`Select ${a.full_name} for email dispatch`}
                          />
                        </td>
                        <td>
                          <strong>{a.full_name}</strong>
                          <div style={{ fontSize: 12, opacity: 0.78 }}>{a.email}</div>
                        </td>
                        <td>{a.track}</td>
                        <td>
                          <span className={a.status === 'accepted' ? 'badge g' : a.status === 'rejected' ? 'badge r' : 'badge'} style={{ marginLeft: 0 }}>
                            {a.status}
                          </span>
                        </td>
                        <td>
                          {a.email_status ? (
                            <span className={a.email_status.startsWith('sent') ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                              {a.email_status}
                            </span>
                          ) : (
                            <span style={{ opacity: 0.7 }}>Pending dispatch</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="admin-panel" aria-label="Compose individual email">
            <p className="admin-kicker">2. COMPOSE INDIVIDUAL MESSAGE</p>
            <form onSubmit={handleSendSingle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div className="field">
                  <label htmlFor="mail-tpl">Load Template</label>
                  <select
                    id="mail-tpl"
                    value={selectedTplKey}
                    onChange={e => applyTemplateToComposer(e.target.value)}
                  >
                    {templates.map(t => (
                      <option key={t.template_key} value={t.template_key}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="mail-to">Recipient Email<span className="req">*</span></label>
                  <input
                    id="mail-to"
                    type="email"
                    required
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    placeholder="recipient@example.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="mail-name">Recipient Name</label>
                  <input
                    id="mail-name"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="Full Name"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="mail-subject">Subject<span className="req">*</span></label>
                <input
                  id="mail-subject"
                  required
                  value={customSubject}
                  onChange={e => setCustomSubject(e.target.value)}
                  placeholder="Veritas MUN Update"
                />
              </div>
              <div className="field">
                <label htmlFor="mail-body">Message Body<span className="req">*</span></label>
                <textarea
                  id="mail-body"
                  required
                  value={customBody}
                  onChange={e => setCustomBody(e.target.value)}
                  style={{ minHeight: 140 }}
                />
              </div>
              <div className="toolbar" style={{ margin: 0 }}>
                <button type="submit" className="btn" disabled={busy}>
                  <Send size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  {busy ? 'Sending...' : 'Send via Resend'}
                </button>
                {customTo.trim() && customSubject.trim() && (
                  <a
                    className="btn ghost"
                    href={buildGmailComposeUrl({
                      to: customTo.trim(),
                      subject: customSubject.trim(),
                      body: customBody.trim()
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Mail size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    Open Draft in Gmail
                  </a>
                )}
              </div>
            </form>
          </section>
        </div>
      )}

      {subTab === 'failed' && (
        <section className="admin-panel" aria-label="Failed to send and manual Gmail confirmation">
          <p className="admin-kicker">FAILED-TO-SEND RECOVERY &amp; MANUAL GMAIL DISPATCH</p>
          <p style={{ marginTop: 0 }}>
            If Resend is not yet verified for your custom domain or a delivery fails, click <strong>Open in Gmail</strong> to launch a pre-filled draft, send it, and click <strong>Mark as Sent</strong> to log official confirmation.
          </p>
          {failedOrQueuedDeliveries.length === 0 ? (
            <div className="admin-empty-state">
              <CheckCircle2 size={24} />
              <strong>Zero pending failed deliveries</strong>
              <p>All dispatched emails have been confirmed either automatically or manually via Gmail.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {failedOrQueuedDeliveries.map(d => {
                const gmailHref = buildGmailComposeUrl({
                  to: d.recipient_email,
                  subject: d.subject,
                  body: d.body_text
                });
                return (
                  <article
                    key={d.id}
                    style={{
                      padding: 14,
                      background: '#FBF8F1',
                      border: '1px solid #C5A19A',
                      borderRadius: 8
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <strong>{d.recipient_name || d.recipient_email}</strong> ({d.recipient_email})
                        <span className="badge r">{d.status}</span>
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{d.subject}</div>
                      </div>
                      <span style={{ fontSize: 12, opacity: 0.72 }}>
                        {new Date(d.created_at).toLocaleString()} · Attempts: {d.attempts}
                      </span>
                    </div>
                    {d.error_message && (
                      <p style={{ margin: '6px 0', color: '#6B1F1F', fontSize: 13 }}>
                        Error: {d.error_message}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                      <a className="btn ghost" href={gmailHref} target="_blank" rel="noopener noreferrer">
                        <Mail size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                        Open in Gmail
                      </a>
                      <input
                        placeholder="Manual confirmation note (optional)"
                        value={manualNoteById[d.id] || ''}
                        onChange={e => setManualNoteById(p => ({ ...p, [d.id]: e.target.value }))}
                        style={{ minWidth: 210 }}
                      />
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void handleMarkManuallySent(d.id)}
                      >
                        <Check size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                        Mark as Sent
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() => void handleRetry(d.id)}
                      >
                        <RotateCcw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                        Retry Resend
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {subTab === 'sent' && (
        <section className="admin-panel" aria-label="Sent emails history">
          <p className="admin-kicker">CONFIRMED EMAIL DELIVERIES &amp; MANUAL GMAIL AUDIT</p>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Sent At</th>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Provider</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sentDeliveries.map(d => (
                  <tr key={d.id}>
                    <td>{d.sent_at ? new Date(d.sent_at).toLocaleString() : '-'}</td>
                    <td>
                      <strong>{d.recipient_name || d.recipient_email}</strong>
                      <div style={{ fontSize: 12, opacity: 0.78 }}>{d.recipient_email}</div>
                    </td>
                    <td>{d.subject}</td>
                    <td>{d.provider}</td>
                    <td><span className="badge g" style={{ marginLeft: 0 }}>sent</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {confirmations.length > 0 && (
            <>
              <p className="admin-kicker" style={{ marginTop: 18 }}>MANUAL GMAIL CONFIRMATION LOG</p>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>Confirmed At</th>
                      <th>Recipient</th>
                      <th>Confirmed By</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmations.map(c => (
                      <tr key={c.id}>
                        <td>{new Date(c.confirmed_at).toLocaleString()}</td>
                        <td>{c.recipient_email}</td>
                        <td>{c.confirmed_by_email}</td>
                        <td>{c.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {subTab === 'templates' && (
        <section className="admin-panel" aria-label="Email templates editor">
          <p className="admin-kicker">POSTGRES EMAIL TEMPLATES</p>
          {editingTpl && (
            <form onSubmit={handleSaveTemplate} style={{ marginBottom: 18, padding: 14, background: '#FAF6EE', border: '1px solid #2F6B34', borderRadius: 8 }}>
              <h3 style={{ margin: '0 0 10px' }}>Editing Template: {editingTpl.template_key}</h3>
              <div className="field">
                <label htmlFor="tpl-name">Template Name</label>
                <input id="tpl-name" required value={editingTpl.name} onChange={e => setEditingTpl({ ...editingTpl, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="tpl-subj">Subject</label>
                <input id="tpl-subj" required value={editingTpl.subject} onChange={e => setEditingTpl({ ...editingTpl, subject: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="tpl-body">Body Text</label>
                <textarea id="tpl-body" required value={editingTpl.body_text} onChange={e => setEditingTpl({ ...editingTpl, body_text: e.target.value })} style={{ minHeight: 140 }} />
              </div>
              <div className="toolbar" style={{ margin: 0 }}>
                <button type="submit" className="btn" disabled={busy}>Save template</button>
                <button type="button" className="btn ghost" onClick={() => setEditingTpl(null)}>Cancel</button>
              </div>
            </form>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(t => (
              <article key={t.id} style={{ padding: 14, background: '#FBF8F1', border: '1px solid #BAB1A0', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <strong>{t.name}</strong> <code>({t.template_key})</code>
                    <div style={{ fontSize: 13, color: '#51464A', marginTop: 4 }}>Subject: {t.subject}</div>
                  </div>
                  <button type="button" className="btn ghost" onClick={() => setEditingTpl({ ...t })}>
                    Edit Template
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
