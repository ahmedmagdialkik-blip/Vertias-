import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, Clock, ShieldAlert, UserRound } from 'lucide-react';
import {
  formatRemainingTime,
  getTargetAvailableDashboardTabs,
  type SupportAccessSession,
  type SupportTargetProfile,
  type TargetDashboardTab
} from '../../utils/supportAccessLogic';

interface SupportSessionOverlayProps {
  sb: any;
  session: SupportAccessSession;
  operatorName: string;
  onSessionEnded: () => Promise<void> | void;
}

interface SupportDashboardPayload {
  session: SupportAccessSession;
  target_profile: SupportTargetProfile;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    audience: string;
    target_department?: string | null;
    created_at: string;
  }>;
  applications: Array<{
    id: string;
    track?: string;
    full_name?: string;
    email?: string;
    school?: string;
    status?: string;
    recommendation?: string | null;
    created_at?: string;
  }>;
}

export const SupportSessionOverlay: React.FC<SupportSessionOverlayProps> = ({
  sb,
  session,
  operatorName,
  onSessionEnded
}) => {
  const [payload, setPayload] = useState<SupportDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [err, setErr] = useState('');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [activeTab, setActiveTab] = useState<TargetDashboardTab>('account');

  const handleEndAccess = useCallback(
    async (endReason = 'manual_exit') => {
      if (ending) return;
      setEnding(true);
      try {
        await sb.rpc('end_support_access', {
          p_session_id: session.id,
          p_end_reason: endReason
        });
      } finally {
        setEnding(false);
        await onSessionEnded();
      }
    },
    [sb, session.id, ending, onSessionEnded]
  );

  const loadTargetDashboard = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await sb.rpc('get_support_session_dashboard_data', {
      p_session_id: session.id
    });
    if (error) {
      setErr(error.message || 'Support access session could not be loaded or has expired.');
      setPayload(null);
      setLoading(false);
      return;
    }
    const parsed = data as SupportDashboardPayload;
    setPayload(parsed);
    const tabs = getTargetAvailableDashboardTabs(parsed?.target_profile);
    setActiveTab(tabs[0]);
    setLoading(false);
  }, [sb, session.id]);

  useEffect(() => {
    void loadTargetDashboard();
  }, [loadTargetDashboard]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      const exp = Date.parse(session.expires_at);
      if (Number.isFinite(exp) && exp <= t) {
        window.clearInterval(id);
        void onSessionEnded();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.expires_at, onSessionEnded]);

  const target = payload?.target_profile;
  const availableTabs = useMemo(() => getTargetAvailableDashboardTabs(target), [target]);
  const remaining = formatRemainingTime(session.expires_at, nowMs);

  return (
    <div style={{ minHeight: '100vh', background: '#EDE6D6', color: '#1A1217' }}>
      <div
        role="region"
        aria-label="Active support access banner"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#1A1217',
          color: '#EDE6D6',
          borderBottom: '2px solid #4F9A57',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 10px',
                background: '#2F6B34',
                color: '#EDE6D6',
                fontFamily: 'Cinzel, serif',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                borderRadius: 2
              }}
            >
              <ShieldAlert size={12} aria-hidden="true" />
              Audited Support Access Active
            </span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>
              Viewing as {target?.full_name || session.target_full_name} ({target?.email || session.target_email})
            </span>
            <span style={{ fontSize: 13, color: '#BAB1A0' }}>
              {target?.role || session.target_role}
              {(target?.department || session.target_department)
                ? ` · ${target?.department || session.target_department}`
                : ''}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#BAB1A0', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>Operator: {operatorName}</span>
            <span>Reason: {session.reason}</span>
            <span style={{ color: '#8FE096', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} aria-hidden="true" />
              Expires in {remaining}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn"
          onClick={() => void handleEndAccess('manual_exit')}
          disabled={ending}
          style={{
            background: '#4F9A57',
            color: '#1A1217',
            borderColor: '#4F9A57',
            fontWeight: 700
          }}
        >
          <ArrowLeft size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {ending ? 'Returning...' : `End support access & return to ${operatorName}`}
        </button>
      </div>

      <div className="main" style={{ maxWidth: 1040, margin: '0 auto', padding: '26px 24px 56px' }}>
        {loading ? (
          <div className="admin-panel">Loading {session.target_full_name}&apos;s dashboard...</div>
        ) : err ? (
          <div className="box" style={{ marginTop: 24 }}>
            <h2>Support access ended</h2>
            <p className="err">{err}</p>
            <button type="button" className="btn" onClick={() => void onSessionEnded()}>
              Return to {operatorName} (Admin)
            </button>
          </div>
        ) : target && !target.active ? (
          <div className="box" style={{ marginTop: 24 }}>
            <h2>Waiting for approval</h2>
            <p>
              This user&apos;s account ({target.email}) is created and confirmed, and is currently inactive pending admin approval in Accounts.
            </p>
            <button type="button" className="btn" onClick={() => void handleEndAccess('manual_exit')}>
              End support access
            </button>
          </div>
        ) : target ? (
          <>
            <div
              style={{
                padding: '10px 14px',
                background: '#FAF6EE',
                border: '1px solid #BAB1A0',
                borderLeft: '4px solid #2F6B34',
                marginBottom: 18,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <span style={{ fontSize: 15 }}>
                Read-only audited dashboard view for <strong>{target.full_name}</strong>. No passwords, session tokens, or permissions were altered.
              </span>
              {availableTabs.length > 1 && (
                <div className="tabs" style={{ margin: 0 }}>
                  {availableTabs.includes('applications') && (
                    <button
                      type="button"
                      className={activeTab === 'applications' ? 'on' : ''}
                      onClick={() => setActiveTab('applications')}
                    >
                      <ClipboardList size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                      {target.role === 'admin' ? 'Admin Applications View' : `${target.department || 'Department'} Applications`}
                    </button>
                  )}
                  <button
                    type="button"
                    className={activeTab === 'account' ? 'on' : ''}
                    onClick={() => setActiveTab('account')}
                  >
                    <UserRound size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    Account View (/account)
                  </button>
                </div>
              )}
            </div>

            {activeTab === 'applications' && (target.role === 'head' || target.role === 'admin') ? (
              <div className="admin-page">
                <div className="admin-page-heading">
                  <div>
                    <p className="admin-kicker">
                      {target.role === 'admin'
                        ? 'OPERATIONS / EXECUTIVE VIEW'
                        : `DEPARTMENT VIEW / ${String(target.department || 'DEPARTMENT').toUpperCase()}`}
                    </p>
                    <h1>Applications Visible to {target.full_name}</h1>
                    <p>
                      Scoped using the same department and role rules enforced by Supabase RLS for this user.
                    </p>
                  </div>
                </div>

                {(payload?.applications || []).length === 0 ? (
                  <div className="admin-empty-state">
                    <strong>No applications currently visible to this account</strong>
                    <p>Applications assigned to this user&apos;s scope will appear here.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {payload!.applications.map(app => (
                      <div className="card" key={app.id} style={{ padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div>
                            <b style={{ fontSize: '1.15rem', display: 'inline' }}>{app.full_name || 'Applicant'}</b>
                            <span className="tag" style={{ marginLeft: 8 }}>{app.track || 'General'}</span>
                            <span className={'tag ' + (app.status === 'accepted' ? 'g' : app.status === 'rejected' ? 'r' : '')} style={{ marginLeft: 6 }}>
                              {app.status || 'pending'}
                            </span>
                            {app.recommendation && (
                              <span className={'tag ' + (app.recommendation === 'accept' ? 'g' : 'r')} style={{ marginLeft: 6 }}>
                                Recommends {app.recommendation}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 13, opacity: 0.72 }}>
                            {app.created_at ? new Date(app.created_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, color: '#4B4145', marginTop: 6 }}>
                          {app.email}{app.school ? ` · ${app.school}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h1>Welcome, {(target.full_name || '').split(' ')[0]}</h1>
                <div className="card">
                  <b style={{ fontSize: '1.4rem' }}>{target.full_name}</b>
                  {target.position || 'Member'}
                  {target.department ? ` · ${target.department}` : ''}
                  <br />
                  Access level: {target.role}
                </div>
                <h2 style={{ marginTop: 22 }}>Announcements</h2>
                {(payload?.announcements || []).length ? (
                  payload!.announcements.map(a => (
                    <div className="card" key={a.id} style={{ marginBottom: 12 }}>
                      <h3 style={{ margin: 0 }}>{a.title}</h3>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
                    </div>
                  ))
                ) : (
                  <p>No announcements yet.</p>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
