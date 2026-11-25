import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, History, KeyRound, RefreshCw, Search, ShieldCheck, UserCheck } from 'lucide-react';
import {
  clampSupportDuration,
  DEFAULT_SUPPORT_DURATION_MINUTES,
  filterRegisteredUsersForSupport,
  formatSupportAuditSummary,
  stripSensitiveAccountFields,
  validateSupportAccessStart,
  type SupportAccessSession,
  type SupportTargetProfile
} from '../../utils/supportAccessLogic';

interface SupportAccessViewProps {
  sb: any;
  me: {
    id: string;
    email: string;
    full_name: string;
    position?: string;
    department?: string;
  };
  onSessionStarted: (session: SupportAccessSession) => Promise<void> | void;
}

export const SupportAccessView: React.FC<SupportAccessViewProps> = ({
  sb,
  me,
  onSessionStarted
}) => {
  const [users, setUsers] = useState<SupportTargetProfile[]>([]);
  const [sessions, setSessions] = useState<SupportAccessSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'member' | 'head' | 'admin'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(DEFAULT_SUPPORT_DURATION_MINUTES);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [profilesRes, sessionsRes] = await Promise.all([
      sb
        .from('profiles')
        .select('id, roster_id, email, full_name, department, position, role, active, created_at')
        .order('full_name', { ascending: true }),
      sb
        .from('support_access_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20)
    ]);

    if (profilesRes.error) {
      setErr(profilesRes.error.message || 'Could not load registered user accounts.');
      setUsers([]);
    } else {
      const sanitized = (profilesRes.data || []).map((row: Record<string, unknown>) =>
        stripSensitiveAccountFields(row)
      ) as SupportTargetProfile[];
      setUsers(sanitized);
    }

    if (!sessionsRes.error && Array.isArray(sessionsRes.data)) {
      setSessions(sessionsRes.data as SupportAccessSession[]);
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredUsers = useMemo(
    () => filterRegisteredUsersForSupport(users, me.id, query, roleFilter),
    [users, me.id, query, roleFilter]
  );

  const selectedUser = useMemo(
    () => filteredUsers.find(u => u.id === selectedUserId) || users.find(u => u.id === selectedUserId) || null,
    [filteredUsers, users, selectedUserId]
  );

  const handleStartAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    const clamped = clampSupportDuration(durationMinutes);
    const issue = validateSupportAccessStart({
      operatorId: me.id,
      targetId: selectedUser?.id,
      reason,
      durationMinutes: clamped
    });
    if (issue) {
      setErr(issue);
      return;
    }

    setStarting(true);
    try {
      const { data, error } = await sb.rpc('start_support_access', {
        target_uid: selectedUser!.id,
        access_reason: reason.trim(),
        duration_minutes: clamped
      });

      if (error) {
        setErr(error.message || 'Could not start temporary support access session.');
        return;
      }

      const created = data as SupportAccessSession;
      setReason('');
      setMsg(`Support access session started for ${selectedUser!.full_name}.`);
      await onSessionStarted(created);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">IT SUPPORT / VERIFIED ACCOUNT ACCESS</p>
          <h1>Support Access</h1>
          <p>
            Exclusive to Ahmed Magdi&apos;s verified Co-Head of IT account. Temporarily open a registered user&apos;s dashboard for troubleshooting without resetting, viewing, or modifying any password. Every session is time-limited and recorded in the audit log.
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
            <span className="admin-stat-label">Verified Operator</span>
            <ShieldCheck className="admin-stat-icon" size={17} />
          </div>
          <strong style={{ display: 'block', marginTop: 8, fontSize: 16 }}>
            {me.full_name}
          </strong>
          <span style={{ fontSize: 12, color: '#61575A' }}>
            {me.position || 'Co-Head of IT'} &middot; {me.email}
          </span>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Registered Accounts</span>
            <UserCheck className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{Math.max(0, users.filter(u => u.id !== me.id).length)}</strong>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Password Policy</span>
            <KeyRound className="admin-stat-icon" size={17} />
          </div>
          <span style={{ display: 'block', marginTop: 8, fontSize: 13, fontWeight: 600, color: '#1F4A25' }}>
            Original passwords untouched
          </span>
          <span style={{ fontSize: 12, color: '#61575A' }}>
            Zero credentials exposed or modified
          </span>
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'start'
        }}
      >
        <section className="admin-panel" aria-label="Select registered user">
          <p className="admin-kicker">1. SELECT REGISTERED USER</p>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <label htmlFor="support-user-search" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Search registered users
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Search size={14} aria-hidden="true" style={{ color: '#61575A', flexShrink: 0 }} />
                <input
                  id="support-user-search"
                  placeholder="Name, email, department, position..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ minWidth: 130 }}>
              <label htmlFor="support-role-filter" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Role filter
              </label>
              <select
                id="support-role-filter"
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as 'all' | 'member' | 'head' | 'admin')}
                style={{ width: '100%' }}
              >
                <option value="all">All roles</option>
                <option value="member">Members</option>
                <option value="head">Department Heads</option>
                <option value="admin">Admins</option>
              </select>
            </div>
          </div>

          {loading ? (
            <p style={{ margin: '12px 0' }}>Loading registered accounts...</p>
          ) : filteredUsers.length === 0 ? (
            <div className="admin-empty-state" style={{ marginTop: 10 }}>
              <strong>No matching registered accounts</strong>
              <p>Try clearing your search or role filter.</p>
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label="Registered users"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 390,
                overflowY: 'auto',
                marginTop: 10,
                paddingRight: 4
              }}
            >
              {filteredUsers.map(user => {
                const isSelected = selectedUser?.id === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setErr('');
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      background: isSelected ? '#1A1217' : '#FAF6EE',
                      color: isSelected ? '#EDE6D6' : '#1A1217',
                      border: isSelected ? '1px solid #2F6B34' : '1px solid #BAB1A0',
                      borderLeft: isSelected ? '4px solid #4F9A57' : '1px solid #BAB1A0',
                      borderRadius: 2,
                      cursor: 'pointer',
                      font: 'inherit'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 15 }}>{user.full_name}</strong>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span
                          className={user.role === 'admin' ? 'badge g' : 'badge'}
                          style={{
                            marginLeft: 0,
                            background: isSelected ? '#EDE6D622' : undefined,
                            color: isSelected ? '#EDE6D6' : undefined
                          }}
                        >
                          {user.role}
                        </span>
                        <span
                          className={user.active ? 'badge g' : 'badge r'}
                          style={{
                            marginLeft: 0,
                            background: isSelected ? '#EDE6D622' : undefined,
                            color: isSelected ? '#EDE6D6' : undefined
                          }}
                        >
                          {user.active ? 'Active' : 'Pending'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, opacity: isSelected ? 0.88 : 0.78, marginTop: 2 }}>
                      {user.email}
                    </div>
                    <div style={{ fontSize: 12, opacity: isSelected ? 0.8 : 0.68, marginTop: 2 }}>
                      {user.position || 'Member'}{user.department ? ` · ${user.department}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-panel" aria-label="Start temporary support access">
          <p className="admin-kicker">2. START AUDITED SUPPORT SESSION</p>
          <form onSubmit={handleStartAccess} style={{ marginTop: 10 }}>
            <div
              style={{
                padding: 12,
                background: '#FAF6EE',
                border: '1px solid #BAB1A0',
                borderRadius: 2,
                marginBottom: 14
              }}
            >
              <span className="review-k">Selected Registered User</span>
              {selectedUser ? (
                <div style={{ marginTop: 4 }}>
                  <strong>{selectedUser.full_name}</strong>
                  <div style={{ fontSize: 14, color: '#4B4145' }}>{selectedUser.email}</div>
                  <div style={{ fontSize: 13, color: '#61575A', marginTop: 2 }}>
                    Role: <strong>{selectedUser.role}</strong>
                    {selectedUser.department ? ` · Department: ${selectedUser.department}` : ''}
                    {selectedUser.position ? ` · ${selectedUser.position}` : ''}
                  </div>
                </div>
              ) : (
                <p style={{ margin: '4px 0 0', fontSize: 14, color: '#61575A' }}>
                  Select a registered user from the directory on the left to inspect their dashboard.
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="support-access-reason">
                Support access reason<span className="req" aria-hidden="true">*</span>
              </label>
              <textarea
                id="support-access-reason"
                required
                minLength={5}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Verifying Security application visibility and announcements for this account"
                style={{ minHeight: 82 }}
              />
              <p className="hint">Recorded permanently in the Veritas MUN audit log.</p>
            </div>

            <div className="field">
              <label htmlFor="support-access-duration">Session time limit</label>
              <select
                id="support-access-duration"
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
                style={{ width: '100%' }}
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes (recommended)</option>
                <option value={30}>30 minutes (maximum)</option>
              </select>
            </div>

            <button
              type="submit"
              className="btn"
              disabled={starting || !selectedUser}
              style={{ width: '100%', textAlign: 'center' }}
            >
              <Clock size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {starting ? 'Starting audited session...' : 'Start support access'}
            </button>
          </form>
        </section>
      </div>

      <section className="admin-panel" aria-label="Support access history" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p className="admin-kicker">AUDIT HISTORY</p>
            <h2 style={{ margin: 0, fontSize: 19 }}>Recent Support Access Sessions</h2>
          </div>
          <History size={17} style={{ color: '#61575A' }} aria-hidden="true" />
        </div>

        {sessions.length === 0 ? (
          <p style={{ margin: '12px 0 0', fontSize: 15, color: '#61575A' }}>
            No temporary support access sessions have been recorded yet.
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Target User</th>
                  <th>Role / Dept</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td>{new Date(s.started_at).toLocaleString()}</td>
                    <td>
                      <strong>{s.target_full_name}</strong>
                      <div style={{ fontSize: 13, opacity: 0.78 }}>{s.target_email}</div>
                    </td>
                    <td>
                      {s.target_role}
                      {s.target_department ? ` · ${s.target_department}` : ''}
                    </td>
                    <td>
                      {s.reason}
                      <div style={{ fontSize: 12, opacity: 0.72 }}>
                        {formatSupportAuditSummary(
                          s.status === 'active'
                            ? 'support_access_started'
                            : s.status === 'expired'
                              ? 'support_access_expired'
                              : 'support_access_ended',
                          {
                            target_full_name: s.target_full_name,
                            target_role: s.target_role,
                            reason: s.reason,
                            end_reason: s.end_reason
                          }
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          s.status === 'active'
                            ? 'badge g'
                            : s.status === 'expired'
                              ? 'badge r'
                              : 'badge'
                        }
                        style={{ marginLeft: 0 }}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
