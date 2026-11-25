import React, { useCallback, useEffect, useState } from 'react';
import { Check, Eye, EyeOff, RefreshCw, Shield, Users } from 'lucide-react';
import {
  DEFAULT_APPLICATION_SETTINGS,
  formatTrackStatusLabel,
  getVisiblePublicTracks,
  normalizeApplicationSettings,
  validateApplicationSettings,
  type ApplicationSettings
} from '../../utils/committeesAndSettingsLogic';

interface ApplicationsManagementViewProps {
  sb: any;
  log: (action: string, details?: Record<string, unknown>) => Promise<unknown> | unknown;
}

export const ApplicationsManagementView: React.FC<ApplicationsManagementViewProps> = ({ sb, log }) => {
  const [settings, setSettings] = useState<ApplicationSettings>(DEFAULT_APPLICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await sb
      .from('site_content')
      .select('key, value')
      .eq('key', 'application_settings')
      .maybeSingle();

    if (error) {
      setErr(error.message || 'Could not load application settings.');
    } else {
      setSettings(normalizeApplicationSettings(data?.value));
    }
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    const issue = validateApplicationSettings(settings);
    if (issue) {
      setErr(issue);
      return;
    }

    const clean: ApplicationSettings = {
      description: settings.description.trim(),
      volunteer: {
        open: Boolean(settings.volunteer.open),
        visible: Boolean(settings.volunteer.visible),
        button_text: settings.volunteer.button_text.trim() || DEFAULT_APPLICATION_SETTINGS.volunteer.button_text
      },
      security: {
        open: Boolean(settings.security.open),
        visible: Boolean(settings.security.visible),
        button_text: settings.security.button_text.trim() || DEFAULT_APPLICATION_SETTINGS.security.button_text
      }
    };

    setSaving(true);
    try {
      const { error } = await sb.from('site_content').upsert({
        key: 'application_settings',
        value: clean,
        updated_at: new Date().toISOString()
      });
      if (error) {
        setErr(error.message || 'Could not save application settings.');
        return;
      }
      setSettings(clean);
      await log('update application_settings', {
        volunteer_open: clean.volunteer.open,
        volunteer_visible: clean.volunteer.visible,
        security_open: clean.security.open,
        security_visible: clean.security.visible
      });
      setMsg('Application settings saved and published.');
    } finally {
      setSaving(false);
    }
  };

  const volunteerStatus = formatTrackStatusLabel(settings.volunteer.open);
  const securityStatus = formatTrackStatusLabel(settings.security.open);
  const previewTracks = getVisiblePublicTracks(settings);

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">WEBSITE / APPLICATIONS</p>
          <h1>Applications Management</h1>
          <p>
            Independently open or close Volunteer and Security applications, customize button text and homepage copy, and control track visibility at the bottom of the website.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void loadSettings()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      <div className="admin-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Volunteer Applications</span>
            <Users className="admin-stat-icon" size={17} />
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className={settings.volunteer.open ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
              {volunteerStatus}
            </span>
            <span style={{ fontSize: 12, color: '#61575A' }}>
              {settings.volunteer.visible ? 'Visible on homepage' : 'Hidden on homepage'}
            </span>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Security Applications</span>
            <Shield className="admin-stat-icon" size={17} />
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className={settings.security.open ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
              {securityStatus}
            </span>
            <span style={{ fontSize: 12, color: '#61575A' }}>
              {settings.security.visible ? 'Visible on homepage' : 'Hidden on homepage'}
            </span>
          </div>
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

      {loading ? (
        <div className="admin-panel">Loading application settings...</div>
      ) : (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="admin-panel">
            <p className="admin-kicker">PUBLIC APPLY SECTION COPY</p>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="app-settings-desc">
                Short description displayed above the application buttons<span className="req" aria-hidden="true">*</span>
              </label>
              <textarea
                id="app-settings-desc"
                required
                value={settings.description}
                onChange={e => setSettings(prev => ({ ...prev, description: e.target.value }))}
                style={{ minHeight: 92 }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: 16
            }}
          >
            <section className="admin-panel" aria-label="Volunteer application controls">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div>
                  <p className="admin-kicker" style={{ marginBottom: 4 }}>VOLUNTEER TRACK</p>
                  <h2 style={{ margin: 0, fontSize: 19 }}>Volunteer Applications</h2>
                </div>
                <span className={settings.volunteer.open ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                  {volunteerStatus}
                </span>
              </div>

              <div className="toolbar" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className={settings.volunteer.open ? 'btn' : 'btn ghost'}
                  aria-pressed={settings.volunteer.open}
                  onClick={() =>
                    setSettings(prev => ({
                      ...prev,
                      volunteer: { ...prev.volunteer, open: true }
                    }))
                  }
                >
                  Open Volunteer
                </button>
                <button
                  type="button"
                  className={!settings.volunteer.open ? 'btn red' : 'btn ghost'}
                  aria-pressed={!settings.volunteer.open}
                  onClick={() =>
                    setSettings(prev => ({
                      ...prev,
                      volunteer: { ...prev.volunteer, open: false }
                    }))
                  }
                >
                  Close Volunteer
                </button>
              </div>

              <div className="field">
                <label htmlFor="volunteer-button-text">Volunteer button text</label>
                <input
                  id="volunteer-button-text"
                  value={settings.volunteer.button_text}
                  onChange={e =>
                    setSettings(prev => ({
                      ...prev,
                      volunteer: { ...prev.volunteer, button_text: e.target.value }
                    }))
                  }
                  placeholder="Apply as Volunteer"
                />
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.volunteer.visible}
                  onChange={e =>
                    setSettings(prev => ({
                      ...prev,
                      volunteer: { ...prev.volunteer, visible: e.target.checked }
                    }))
                  }
                />
                <span>
                  {settings.volunteer.visible ? (
                    <Eye size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  ) : (
                    <EyeOff size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  )}
                  Show Volunteer application on public website
                </span>
              </label>
            </section>

            <section className="admin-panel" aria-label="Security application controls">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div>
                  <p className="admin-kicker" style={{ marginBottom: 4 }}>SECURITY TRACK</p>
                  <h2 style={{ margin: 0, fontSize: 19 }}>Security Applications</h2>
                </div>
                <span className={settings.security.open ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                  {securityStatus}
                </span>
              </div>

              <div className="toolbar" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className={settings.security.open ? 'btn' : 'btn ghost'}
                  aria-pressed={settings.security.open}
                  onClick={() =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, open: true }
                    }))
                  }
                >
                  Open Security
                </button>
                <button
                  type="button"
                  className={!settings.security.open ? 'btn red' : 'btn ghost'}
                  aria-pressed={!settings.security.open}
                  onClick={() =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, open: false }
                    }))
                  }
                >
                  Close Security
                </button>
              </div>

              <div className="field">
                <label htmlFor="security-button-text">Security button text</label>
                <input
                  id="security-button-text"
                  value={settings.security.button_text}
                  onChange={e =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, button_text: e.target.value }
                    }))
                  }
                  placeholder="Apply as Security"
                />
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.security.visible}
                  onChange={e =>
                    setSettings(prev => ({
                      ...prev,
                      security: { ...prev.security, visible: e.target.checked }
                    }))
                  }
                />
                <span>
                  {settings.security.visible ? (
                    <Eye size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  ) : (
                    <EyeOff size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  )}
                  Show Security application on public website
                </span>
              </label>
            </section>
          </div>

          <div className="admin-panel" aria-label="Homepage preview">
            <p className="admin-kicker">PUBLIC HOMEPAGE PREVIEW (BOTTOM SECTION)</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              {previewTracks.length === 0 ? (
                <span className="badge">No application tracks currently visible on homepage</span>
              ) : (
                previewTracks.map(track => (
                  <span key={track.key} className={track.open ? 'badge g' : 'badge r'} style={{ marginLeft: 0 }}>
                    {track.title} &mdash; {track.statusLabel}
                  </span>
                ))
              )}
            </div>
            <p style={{ margin: '0 0 12px', maxWidth: '62ch' }}>{settings.description}</p>
            <div className="toolbar" style={{ margin: 0 }}>
              {previewTracks.map(track => (
                <span
                  key={track.key}
                  className={track.open ? 'btn' : 'btn ghost'}
                  style={{ opacity: track.open ? 1 : 0.65, pointerEvents: 'none' }}
                >
                  {track.buttonText} ({track.statusLabel})
                </span>
              ))}
            </div>
          </div>

          <div className="toolbar" style={{ margin: 0 }}>
            <button type="submit" className="btn" disabled={saving}>
              <Check size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {saving ? 'Saving settings...' : 'Save application settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
