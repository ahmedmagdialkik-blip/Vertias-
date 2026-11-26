import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Mail, RefreshCw, Shield, UserCheck } from 'lucide-react';
import { invokeEdgeFunction } from './invokeEdgeFunction';

interface AccountsGovernanceViewProps {
  sb: any;
  me: any;
  log: (action: string, details?: Record<string, unknown>) => Promise<unknown> | unknown;
}

const PERM_KEYS = [
  { key: 'qr_scanner', label: 'QR Scanner' },
  { key: 'hr_invites', label: 'HR Invites' },
  { key: 'email_manage', label: 'Email Center' },
  { key: 'cms_manage', label: 'CMS Manage' }
] as const;

export const AccountsGovernanceView: React.FC<AccountsGovernanceViewProps> = ({ sb, me, log }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    const { data, error } = await sb
      .from('profiles')
      .select('id, roster_id, email, full_name, department, position, role, eb_rank, section, permissions, active, suspended_reason, created_at')
      .order('active')
      .order('full_name');
    if (error) setErr(error.message);
    else setRows(data || []);
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const payload = {
        action: 'update_account',
        target_user_id: editing.id,
        role: editing.role,
        department: editing.department,
        position: editing.position,
        section: editing.section || '',
        eb_rank: editing.eb_rank || 'member',
        permissions: editing.permissions || {},
        active: Boolean(editing.active),
        suspended_reason: editing.suspended_reason || ''
      };

      const res = await invokeEdgeFunction<{ ok?: boolean }>(sb, 'veritas-admin-ops', payload);
      if (res.isEdgeUnavailable) {
        const { error: dbErr } = await sb
          .from('profiles')
          .update({
            role: payload.role,
            department: payload.department,
            position: payload.position,
            section: payload.section,
            eb_rank: payload.eb_rank,
            permissions: payload.permissions,
            active: payload.active,
            suspended_reason: payload.suspended_reason
          })
          .eq('id', editing.id);
        if (dbErr) {
          setErr(dbErr.message);
          return;
        }
        await log('update_account', { target_id: editing.id, role: payload.role, active: payload.active });
        setMsg(`Updated ${editing.full_name} in Postgres (deploy veritas-admin-ops to also sync Auth session bans).`);
      } else if (res.error) {
        setErr(res.error);
        return;
      } else {
        setMsg(`Updated ${editing.full_name}. Original password remains unchanged.`);
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleSendRecovery = async (targetEmail: string) => {
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const res = await invokeEdgeFunction<{ message?: string }>(sb, 'veritas-admin-ops', {
        action: 'send_password_recovery',
        email: targetEmail,
        redirect_to: `${location.origin}/login`
      });
      if (res.isEdgeUnavailable) {
        const { error } = await sb.auth.resetPasswordForEmail(targetEmail, {
          redirectTo: `${location.origin}/login`
        });
        if (error) {
          setErr(error.message);
          return;
        }
        await log('admin_triggered_password_recovery', { target_email: targetEmail });
        setMsg(`Standard password recovery email requested for ${targetEmail}.`);
      } else if (res.error) {
        setErr(res.error);
        return;
      } else {
        setMsg(res.data?.message || `Recovery email requested for ${targetEmail}.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const shown = rows.filter(r => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${r.full_name} ${r.email} ${r.department} ${r.position} ${r.role}`.toLowerCase().includes(q);
  });

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">TEAM MANAGEMENT / ACCESS GOVERNANCE</p>
          <h1>Accounts &amp; Permissions</h1>
          <p>
            Approve or suspend accounts, assign department heads and granular capabilities, and trigger standard Supabase recovery emails without ever exposing or modifying existing passwords.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void load()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      {msg && <div className="msg" role="status" style={{ fontWeight: 600 }}>{msg}</div>}
      {err && <div className="err" role="alert">{err}</div>}

      {editing && (
        <form className="admin-panel" onSubmit={handleSave} style={{ borderColor: '#2F6B34' }}>
          <p className="admin-kicker">EDIT ACCOUNT GOVERNANCE — {editing.email}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <div className="field">
              <label htmlFor="acc-role">Role</label>
              <select id="acc-role" value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}>
                <option value="member">member</option>
                <option value="head">head</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="acc-rank">EB Rank</label>
              <select id="acc-rank" value={editing.eb_rank || 'member'} onChange={e => setEditing({ ...editing, eb_rank: e.target.value })}>
                <option value="member">member</option>
                <option value="co_head">co_head</option>
                <option value="head">head</option>
                <option value="executive">executive</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="acc-dept">Department</label>
              <input id="acc-dept" value={editing.department || ''} onChange={e => setEditing({ ...editing, department: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="acc-pos">Position</label>
              <input id="acc-pos" value={editing.position || ''} onChange={e => setEditing({ ...editing, position: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="acc-sec">Security Section</label>
              <select id="acc-sec" value={editing.section || ''} onChange={e => setEditing({ ...editing, section: e.target.value })}>
                <option value="">Not assigned</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="acc-susp">Suspension Note (if inactive)</label>
              <input id="acc-susp" value={editing.suspended_reason || ''} onChange={e => setEditing({ ...editing, suspended_reason: e.target.value })} placeholder="Reason if suspended" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '6px 0 14px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={Boolean(editing.active)}
                disabled={editing.id === me.id}
                onChange={e => setEditing({ ...editing, active: e.target.checked })}
              />
              Account Active
            </label>
            {PERM_KEYS.map(pk => (
              <label key={pk.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(editing.permissions?.[pk.key])}
                  onChange={e =>
                    setEditing({
                      ...editing,
                      permissions: { ...(editing.permissions || {}), [pk.key]: e.target.checked }
                    })
                  }
                />
                {pk.label}
              </label>
            ))}
          </div>

          <div className="toolbar" style={{ margin: 0 }}>
            <button type="submit" className="btn" disabled={busy}>
              <UserCheck size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {busy ? 'Saving...' : 'Save Account Governance'}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void handleSendRecovery(editing.email)}
            >
              <Mail size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Send Password Recovery Email
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="admin-filter-panel">
        <div className="admin-filter-heading">
          <span className="admin-kicker">REGISTERED PORTAL ACCOUNTS ({shown.length})</span>
          <span style={{ fontSize: 12, color: '#2F6B34', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <KeyRound size={13} /> Passwords strictly managed by Supabase Auth
          </span>
        </div>
        <input
          placeholder="Search name, email, department, role..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Department &amp; Position</th>
              <th>Role / Rank</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td>
                  <strong>{r.full_name}</strong>
                  <div style={{ fontSize: 12, opacity: 0.78 }}>{r.email}</div>
                </td>
                <td>
                  {r.department || '-'} · {r.position || 'Member'}
                  {r.section ? ` (${r.section})` : ''}
                </td>
                <td>
                  <span className={r.role === 'admin' ? 'badge g' : 'badge'} style={{ marginLeft: 0 }}>{r.role}</span>
                  {r.eb_rank && r.eb_rank !== 'member' ? ` · ${r.eb_rank}` : ''}
                </td>
                <td>
                  {PERM_KEYS.filter(pk => r.permissions?.[pk.key]).map(pk => (
                    <span key={pk.key} className="badge" style={{ marginLeft: 0, marginRight: 4 }}>
                      {pk.label}
                    </span>
                  ))}
                  {!PERM_KEYS.some(pk => r.permissions?.[pk.key]) && (
                    <span style={{ opacity: 0.65 }}>{r.role === 'admin' ? 'All (Admin)' : 'Standard'}</span>
                  )}
                </td>
                <td>
                  <span className={r.active ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                    {r.active ? 'Active' : 'Inactive / Suspended'}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setEditing({ ...r, permissions: r.permissions || {} })}
                  >
                    <Shield size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
