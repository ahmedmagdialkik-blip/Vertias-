import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Link2, Mail, RefreshCw, Shield, Trash2, UserPlus, Users } from 'lucide-react';
import { buildGmailComposeUrl, interpolateEmailTemplate } from '../../utils/managementLogic';
import { invokeEdgeFunction } from './invokeEdgeFunction';

interface HrInvitesViewProps {
  sb: any;
  me: any;
}

interface IssuedLink {
  application_id?: string;
  invite_id: string;
  email: string;
  invite_url: string;
  full_name?: string;
  department?: string;
  position?: string;
}

export const HrInvitesView: React.FC<HrInvitesViewProps> = ({ sb, me }) => {
  const [acceptedApps, setAcceptedApps] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Record<string, { subject: string; body_text: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [trackFilter, setTrackFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [issuedLinks, setIssuedLinks] = useState<IssuedLink[]>([]);
  const [copiedId, setCopiedId] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // EB / Staff Invite generator (Admin only)
  const [ebForm, setEbForm] = useState({
    reusable: false,
    email: '',
    full_name: '',
    department: 'HR',
    position: 'Head of Department',
    assigned_role: 'head',
    max_uses: 10
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [appsRes, invRes, profRes, tplRes] = await Promise.all([
      sb
        .from('applications')
        .select('id, full_name, email, phone, track, gender, status, created_at')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false }),
      sb.from('signup_invites').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('profiles').select('id, email, full_name, department, role, active'),
      sb.from('email_templates').select('template_key, subject, body_text')
    ]);

    if (appsRes.error) setErr(appsRes.error.message);
    else setAcceptedApps(appsRes.data || []);

    if (!invRes.error) setInvites(invRes.data || []);
    if (!profRes.error) setProfiles(profRes.data || []);
    if (!tplRes.error && Array.isArray(tplRes.data)) {
      const m: Record<string, { subject: string; body_text: string }> = {};
      for (const t of tplRes.data) m[t.template_key] = { subject: t.subject, body_text: t.body_text };
      setTemplates(m);
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const profileEmails = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles) {
      if (p.email) s.add(String(p.email).trim().toLowerCase());
    }
    return s;
  }, [profiles]);

  const inviteByAppId = useMemo(() => {
    const m = new Map<string, any>();
    for (const inv of invites) {
      if (inv.application_id && !inv.revoked_at) {
        if (!m.has(inv.application_id)) m.set(inv.application_id, inv);
      }
    }
    return m;
  }, [invites]);

  const filteredAccepted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return acceptedApps.filter(a => {
      if (trackFilter !== 'all' && a.track !== trackFilter) return false;
      if (q) {
        const hay = `${a.full_name} ${a.email} ${a.track}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [acceptedApps, trackFilter, query]);

  const issueForApps = async (appIds: string[]) => {
    if (!appIds.length) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data, error } = await invokeEdgeFunction<{
        ok?: boolean;
        created?: IssuedLink[];
        skipped?: Array<{ application_id: string; reason: string }>;
      }>(sb, 'veritas-invites', {
        action: 'create_applicant_invites',
        application_ids: appIds
      });

      if (error || !data) {
        setErr(error || 'Failed to generate personal onboarding invites.');
        return;
      }

      const appMap = new Map(acceptedApps.map(a => [a.id, a]));
      const enriched = (data.created || []).map(item => {
        const app = item.application_id ? appMap.get(item.application_id) : undefined;
        return {
          ...item,
          full_name: app?.full_name || item.email,
          department: app?.track || 'Department',
          position: `${app?.track || 'Department'} Member`
        };
      });
      setIssuedLinks(enriched);
      setSelectedIds([]);
      setMsg(
        `Generated ${enriched.length} personal onboarding link(s).${
          data.skipped?.length ? ` Skipped ${data.skipped.length}.` : ''
        }`
      );
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateEbInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { data, error } = await invokeEdgeFunction<{ ok?: boolean; invite?: any; invite_url?: string }>(
        sb,
        'veritas-invites',
        {
          action: 'create_eb_invite',
          reusable: ebForm.reusable,
          email: ebForm.email.trim(),
          full_name: ebForm.full_name.trim(),
          department: ebForm.department.trim(),
          position: ebForm.position.trim(),
          assigned_role: ebForm.assigned_role,
          max_uses: ebForm.max_uses
        }
      );
      if (error || !data?.invite_url) {
        setErr(error || 'Could not create Executive Board invite.');
        return;
      }
      setIssuedLinks([
        {
          invite_id: data.invite?.id || 'eb',
          email: ebForm.email.trim() || 'Reusable Invite',
          invite_url: data.invite_url,
          full_name: ebForm.full_name.trim() || 'Team Member',
          department: ebForm.department.trim(),
          position: ebForm.position.trim()
        }
      ]);
      setEbForm(prev => ({ ...prev, email: '', full_name: '' }));
      setMsg('Executive Board / Staff invitation link generated.');
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const { error } = await invokeEdgeFunction(sb, 'veritas-invites', {
        action: 'revoke_invite',
        invite_id: inviteId
      });
      if (error) {
        setErr(error);
        return;
      }
      setMsg('Invitation link revoked.');
      await loadData();
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 1800);
    } catch {
      setMsg(`Copy URL manually: ${url}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const onboardedCount = acceptedApps.filter(a => profileEmails.has(String(a.email || '').toLowerCase())).length;

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">APPLICATIONS &amp; HR / ONBOARDING</p>
          <h1>HR Invites &amp; Staff Onboarding</h1>
          <p>
            Issue non-expiring single-use onboarding links to accepted applicants, preserve existing user passwords, and generate Executive Board or Department Head links.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void loadData()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Accepted Applicants</span>
            <Users className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{acceptedApps.length}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Accounts Activated</span>
            <Check className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{onboardedCount}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Awaiting Onboarding</span>
            <UserPlus className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{Math.max(0, acceptedApps.length - onboardedCount)}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Total Invites Issued</span>
            <Link2 className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{invites.length}</strong>
        </div>
      </div>

      {msg && <div className="msg" role="status" style={{ fontWeight: 600 }}>{msg}</div>}
      {err && <div className="err" role="alert">{err}</div>}

      {issuedLinks.length > 0 && (
        <section className="admin-panel" aria-label="Newly issued invite links" style={{ borderColor: '#2F6B34' }}>
          <p className="admin-kicker">ISSUED ONBOARDING LINKS (COPY OR SEND VIA GMAIL)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {issuedLinks.map(item => {
              const tpl = templates.applicant_invite || templates.eb_invite;
              const vars = {
                full_name: item.full_name || '',
                email: item.email || '',
                invite_url: item.invite_url || '',
                department: item.department || '',
                position: item.position || ''
              };
              const mailHref = buildGmailComposeUrl({
                to: item.email.includes('@') ? item.email : '',
                subject: interpolateEmailTemplate(
                  tpl?.subject || 'Veritas MUN — Activate Your {{department}} Account',
                  vars
                ),
                body: interpolateEmailTemplate(
                  tpl?.body_text || 'Dear {{full_name}},\n\nOpen your setup link:\n{{invite_url}}',
                  vars
                )
              });
              return (
                <div
                  key={item.invite_id + item.email}
                  style={{
                    padding: 12,
                    background: '#FBF8F1',
                    border: '1px solid #BAB1A0',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <strong>{item.full_name || item.email}</strong> ({item.email})
                    <div style={{ fontSize: 12, color: '#2F6B34', wordBreak: 'break-all', marginTop: 4 }}>
                      {item.invite_url}
                    </div>
                  </div>
                  <div className="toolbar" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void copyUrl(item.invite_id, item.invite_url)}
                    >
                      <Copy size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                      {copiedId === item.invite_id ? 'Copied' : 'Copy link'}
                    </button>
                    <a className="btn ghost" href={mailHref} target="_blank" rel="noopener noreferrer">
                      <Mail size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                      Open in Gmail
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="admin-panel" aria-label="Accepted applicants onboarding">
        <div className="admin-filter-heading">
          <div>
            <p className="admin-kicker">1. ACCEPTED APPLICANTS DIRECTORY</p>
            <h2 style={{ margin: 0 }}>Issue Personal Setup Links</h2>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void issueForApps(selectedIds)}
            >
              <UserPlus size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Issue invites ({selectedIds.length})
            </button>
          )}
        </div>

        <div className="admin-filter-grid" style={{ marginBottom: 12 }}>
          <input
            placeholder="Search accepted applicants..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <select value={trackFilter} onChange={e => setTrackFilter(e.target.value)}>
            <option value="all">All tracks</option>
            <option value="Security">Security</option>
            <option value="Volunteers">Volunteers</option>
          </select>
        </div>

        {loading ? (
          <p>Loading accepted applicants...</p>
        ) : filteredAccepted.length === 0 ? (
          <div className="admin-empty-state">
            <strong>No accepted applicants match the current filter</strong>
            <p>Once applicants are marked accepted in Applications, they appear here for HR onboarding.</p>
          </div>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Applicant</th>
                  <th>Track</th>
                  <th>Account Status</th>
                  <th>Invite Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccepted.map(app => {
                  const hasAccount = profileEmails.has(String(app.email || '').toLowerCase());
                  const existingInv = inviteByAppId.get(app.id);
                  return (
                    <tr key={app.id}>
                      <td>
                        <input
                          type="checkbox"
                          disabled={hasAccount}
                          checked={selectedIds.includes(app.id)}
                          onChange={() => toggleSelect(app.id)}
                          aria-label={`Select ${app.full_name}`}
                        />
                      </td>
                      <td>
                        <strong>{app.full_name}</strong>
                        <div style={{ fontSize: 12, opacity: 0.78 }}>{app.email}</div>
                      </td>
                      <td>{app.track}</td>
                      <td>
                        <span className={hasAccount ? 'badge g' : 'badge'} style={{ marginLeft: 0 }}>
                          {hasAccount ? 'Registered' : 'Not registered'}
                        </span>
                      </td>
                      <td>
                        {existingInv ? (
                          <span className={existingInv.use_count >= existingInv.max_uses ? 'badge g' : 'badge'} style={{ marginLeft: 0 }}>
                            {existingInv.use_count >= existingInv.max_uses
                              ? 'Claimed'
                              : `Issued (${existingInv.token_preview})`}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.7 }}>Not issued</span>
                        )}
                      </td>
                      <td>
                        {hasAccount ? (
                          <span style={{ fontSize: 12, color: '#2F6B34' }}>Password preserved</span>
                        ) : (
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={busy}
                            onClick={() => void issueForApps([app.id])}
                          >
                            {existingInv ? 'Resend / New Link' : 'Issue Invite'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {me.role === 'admin' && (
        <section className="admin-panel" aria-label="Executive Board invite generator">
          <p className="admin-kicker">2. EXECUTIVE BOARD &amp; STAFF INVITE GENERATOR (ADMIN ONLY)</p>
          <h2 style={{ margin: '0 0 10px' }}>Create Role-Locked or Reusable Invite</h2>
          <form onSubmit={handleCreateEbInvite}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div className="field">
                <label htmlFor="eb-inv-kind">Invite Type</label>
                <select
                  id="eb-inv-kind"
                  value={ebForm.reusable ? 'reusable' : 'email'}
                  onChange={e => setEbForm(p => ({ ...p, reusable: e.target.value === 'reusable' }))}
                >
                  <option value="email">Single-Use Email-Locked Invite</option>
                  <option value="reusable">Multi-Use Reusable Department Invite</option>
                </select>
              </div>
              {!ebForm.reusable ? (
                <div className="field">
                  <label htmlFor="eb-inv-email">Recipient Email<span className="req">*</span></label>
                  <input
                    id="eb-inv-email"
                    type="email"
                    required
                    value={ebForm.email}
                    onChange={e => setEbForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="head@veritasmun.org"
                  />
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="eb-inv-max">Max Uses</label>
                  <input
                    id="eb-inv-max"
                    type="number"
                    min={2}
                    max={100}
                    value={ebForm.max_uses}
                    onChange={e => setEbForm(p => ({ ...p, max_uses: Number(e.target.value) || 10 }))}
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="eb-inv-name">Full Name (optional for reusable)</label>
                <input
                  id="eb-inv-name"
                  value={ebForm.full_name}
                  onChange={e => setEbForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Recipient name"
                />
              </div>
              <div className="field">
                <label htmlFor="eb-inv-dept">Department</label>
                <input
                  id="eb-inv-dept"
                  required
                  value={ebForm.department}
                  onChange={e => setEbForm(p => ({ ...p, department: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="eb-inv-pos">Position</label>
                <input
                  id="eb-inv-pos"
                  required
                  value={ebForm.position}
                  onChange={e => setEbForm(p => ({ ...p, position: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="eb-inv-role">Assigned Role</label>
                <select
                  id="eb-inv-role"
                  value={ebForm.assigned_role}
                  onChange={e => setEbForm(p => ({ ...p, assigned_role: e.target.value }))}
                >
                  <option value="member">member</option>
                  <option value="head">head</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn" disabled={busy}>
              <Shield size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Generate EB / Staff Invite Link
            </button>
          </form>
        </section>
      )}

      <section className="admin-panel" aria-label="Invitations audit table">
        <p className="admin-kicker">INVITATION REGISTRY (HASHED TOKENS)</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Recipient</th>
                <th>Department / Role</th>
                <th>Token Preview</th>
                <th>Uses</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(inv => {
                const revoked = Boolean(inv.revoked_at);
                const exhausted = inv.use_count >= inv.max_uses;
                return (
                  <tr key={inv.id}>
                    <td>{inv.invite_kind}</td>
                    <td>
                      <strong>{inv.recipient_name || 'Open link'}</strong>
                      <div style={{ fontSize: 12, opacity: 0.78 }}>{inv.recipient_email || 'Any email'}</div>
                    </td>
                    <td>{inv.department} · {inv.position} ({inv.assigned_role})</td>
                    <td><code>{inv.token_preview}</code></td>
                    <td>{inv.use_count} / {inv.max_uses}</td>
                    <td>
                      <span className={revoked ? 'badge r' : exhausted ? 'badge g' : 'badge'} style={{ marginLeft: 0 }}>
                        {revoked ? 'Revoked' : exhausted ? 'Claimed' : 'Active'}
                      </span>
                    </td>
                    <td>
                      {!revoked && !exhausted && (
                        <button
                          type="button"
                          className="btn red"
                          disabled={busy}
                          onClick={() => void handleRevoke(inv.id)}
                        >
                          <Trash2 size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
