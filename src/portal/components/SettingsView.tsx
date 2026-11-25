import React, { useEffect, useMemo, useState } from 'react';
import { Save, Search } from 'lucide-react';
import { formatDateTime } from '../../utils/portalAdminLogic';
import { isValidEmailFormat } from '../../utils/portalLogic';
import {
  recordPortalAuditLog,
  sb,
  type PortalAuditEntry,
  type PortalProfile
} from '../supabaseClient';

interface SettingsViewProps {
  me: PortalProfile;
  auditLogs: PortalAuditEntry[];
  loadingLogs: boolean;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  me,
  auditLogs,
  loadingLogs,
  onRefresh,
  onToast
}) => {
  const [siteName, setSiteName] = useState('Veritas MUN');
  const [contactEmail, setContactEmail] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logQuery, setLogQuery] = useState('');

  useEffect(() => {
    let active = true;
    sb.from('site_content')
      .select('key, value')
      .eq('key', 'settings')
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const val = data?.value as Record<string, unknown> | undefined;
        if (val && typeof val === 'object') {
          if (typeof val.site_name === 'string' && val.site_name.trim()) setSiteName(val.site_name);
          if (typeof val.contact_email === 'string') setContactEmail(val.contact_email);
          if (typeof val.registration_open === 'boolean') setRegistrationOpen(val.registration_open);
        }
        setLoadingSettings(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = siteName.trim() || 'Veritas MUN';
    const cleanEmail = contactEmail.trim();
    if (cleanEmail && !isValidEmailFormat(cleanEmail)) {
      onToast('error', 'Enter a valid contact email or leave it blank.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        site_name: cleanName,
        contact_email: cleanEmail,
        registration_open: registrationOpen
      };
      const { error } = await sb.from('site_content').upsert(
        {
          key: 'settings',
          value: payload,
          updated_by: me.id,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'key' }
      );
      if (error) {
        onToast('error', error.message || 'Could not save settings.');
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'settings.update', payload);
      onToast('success', 'Conference settings saved.');
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    if (!q) return auditLogs;
    return auditLogs.filter(entry => {
      const detailsStr = JSON.stringify(entry.details || {}).toLowerCase();
      return (
        entry.action.toLowerCase().includes(q) ||
        (entry.user_email || '').toLowerCase().includes(q) ||
        detailsStr.includes(q)
      );
    });
  }, [auditLogs, logQuery]);

  return (
    <div className="space-y-6 v-animate-in">
      <div className="border-b border-[#1A1217]/14 pb-4">
        <h2 className="font-display text-2xl font-semibold text-[#1A1217]">Settings &amp; Audit Trail</h2>
        <p className="mt-1 text-sm text-[#1A1217]/70">
          Configure conference metadata and inspect the administrative audit log.
        </p>
      </div>

      {/* Conference Settings Card */}
      <form
        onSubmit={handleSaveSettings}
        className="max-w-2xl rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-6 space-y-4"
      >
        <h3 className="border-b border-[#1A1217]/12 pb-3 font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
          Conference Metadata
        </h3>

        {loadingSettings ? (
          <p className="text-sm text-[#1A1217]/65">Loading conference settings...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="set-site-name" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Conference Name
                </label>
                <input
                  id="set-site-name"
                  type="text"
                  required
                  value={siteName}
                  onChange={e => setSiteName(e.target.value)}
                  className="v-input"
                />
              </div>
              <div>
                <label htmlFor="set-contact-email" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Public Contact Email
                </label>
                <input
                  id="set-contact-email"
                  type="email"
                  placeholder="secretariat@veritasmun.org"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  className="v-input"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[2px] border border-[#1A1217]/12 bg-[#EDE6D6]/40 p-3.5">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-[#1A1217]">
                  Application Intake Open
                </span>
                <span className="text-xs text-[#1A1217]/65">
                  Records conference intake status in public settings metadata.
                </span>
              </div>
              <input
                type="checkbox"
                checked={registrationOpen}
                onChange={e => setRegistrationOpen(e.target.checked)}
                className="h-4 w-4 accent-[#2F6B34]"
              />
            </label>

            <button type="submit" disabled={saving} className="v-btn v-btn-primary">
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </>
        )}
      </form>

      {/* Audit Log */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-3.5">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/45" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search audit log"
              placeholder="Filter audit log by action, email, or details..."
              value={logQuery}
              onChange={e => setLogQuery(e.target.value)}
              className="v-input pl-9"
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-[#1A1217]/65">
            {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="overflow-x-auto rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE]">
          {loadingLogs ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-10 w-full animate-pulse rounded-[2px] bg-[#EDE6D6]" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-editorial text-lg italic text-[#1A1217]/70">
                No audit log entries match your filter.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[740px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#1A1217]/12 bg-[#F4EFE4] text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/70">
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1217]/10 text-sm">
                {filteredLogs.map(entry => (
                  <tr key={entry.id} className="align-top hover:bg-[#EDE6D6]/45 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs tabular-nums text-[#1A1217]/70">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#1A1217]">
                      {entry.user_email || 'Administrator'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold text-[#2F6B34]">{entry.action}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#1A1217]/75 break-all">
                      {JSON.stringify(entry.details || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
