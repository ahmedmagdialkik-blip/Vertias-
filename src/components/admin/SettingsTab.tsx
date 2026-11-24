import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { recordAuditLog, supabase } from '../../lib/supabase';
import type { SiteSettings } from '../../types/database';
import { DEFAULT_SITE_CONTENT, isValidEmailFormat, mergeSiteContentWithFallback } from '../../utils/portalLogic';

interface SettingsTabProps {
  onToast: (kind: 'success' | 'error', text: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ onToast }) => {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_CONTENT.settings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('site_content')
      .select('key, value')
      .eq('key', 'settings')
      .then(({ data }) => {
        if (cancelled) return;
        const merged = mergeSiteContentWithFallback(data ?? []);
        setSettings(merged.settings);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    const cleanName = settings.site_name.trim() || 'Veritas MUN';
    const cleanEmail = settings.contact_email.trim();
    if (cleanEmail && !isValidEmailFormat(cleanEmail)) {
      onToast('error', 'Enter a valid contact email or leave it blank.');
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload: SiteSettings = {
        site_name: cleanName,
        registration_open: settings.registration_open,
        contact_email: cleanEmail
      };
      const row = {
        key: 'settings',
        value: payload,
        updated_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString()
      };

      const [pubRes, draftRes] = await Promise.all([
        supabase.from('site_content').upsert(row, { onConflict: 'key' }),
        supabase.from('site_content_drafts').upsert(row, { onConflict: 'key' })
      ]);

      const err = pubRes.error || draftRes.error;
      if (err) {
        onToast('error', err.message || 'Could not save settings.');
        return;
      }

      await recordAuditLog('settings.update', payload as unknown as Record<string, unknown>);
      onToast('success', 'Settings saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-6">
        <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/75">
          Loading settings...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl border border-[#1A1217]/15 bg-[#FAF6EE] p-6 space-y-5">
      <h2 className="border-b border-[#1A1217]/15 pb-3 font-['Cinzel',serif] text-sm font-semibold uppercase tracking-wider">
        Conference &amp; Site Settings
      </h2>

      <div>
        <label htmlFor="set-site-name" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
          Site Name
        </label>
        <input
          id="set-site-name"
          type="text"
          required
          value={settings.site_name}
          onChange={e => setSettings(s => ({ ...s, site_name: e.target.value }))}
          className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
        />
      </div>

      <div>
        <label htmlFor="set-contact-email" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
          Public Contact Email
        </label>
        <input
          id="set-contact-email"
          type="email"
          placeholder="secretariat@example.org"
          value={settings.contact_email}
          onChange={e => setSettings(s => ({ ...s, contact_email: e.target.value }))}
          className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#EDE6D6]/50 px-3 py-1.5 text-base"
        />
      </div>

      <div className="border border-[#1A1217]/15 bg-[#EDE6D6]/45 p-4">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <div>
            <span className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#1A1217]">
              Delegate Registration Open
            </span>
            <span className="block font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/75">
              Controls registration status displayed in the public Register section.
            </span>
          </div>
          <input
            type="checkbox"
            checked={settings.registration_open}
            onChange={e => setSettings(s => ({ ...s, registration_open: e.target.checked }))}
            className="h-5 w-5 accent-[#2F6B34]"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex min-h-[44px] items-center gap-2 bg-[#2F6B34] px-6 py-2.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-[0.12em] text-[#EDE6D6] hover:bg-[#1F4A25] disabled:opacity-60"
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        <span>{saving ? 'Saving...' : 'Save Settings'}</span>
      </button>
    </form>
  );
};
