import React, { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, LogOut, Megaphone, Shield, UserCheck } from 'lucide-react';
import { formatDateTime } from '../../utils/portalAdminLogic';
import { sb, type PortalAnnouncement, type PortalProfile } from '../supabaseClient';

interface AccountViewProps {
  me: PortalProfile;
  embedded?: boolean;
  onOpenAdmin?: () => void;
}

export const AccountView: React.FC<AccountViewProps> = ({ me, embedded = false, onOpenAdmin }) => {
  const [announcements, setAnnouncements] = useState<PortalAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    sb.from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setAnnouncements((data as PortalAnnouncement[]) || []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const firstName = (me.full_name || '').trim().split(/\s+/)[0] || 'Member';

  const content = (
    <div className="space-y-6">
      <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[2px] bg-[#1A1217] font-display text-lg font-semibold text-[#EDE6D6]">
              {(me.full_name || 'V').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">Active Profile</p>
              <h2 className="font-display text-xl font-semibold text-[#1A1217]">{me.full_name}</h2>
              <p className="mt-0.5 text-sm text-[#1A1217]/75">
                {me.position || 'Member'}
                {me.department ? ` · ${me.department}` : ''} · {me.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="v-status v-status-accepted">
              <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Role: {me.role}</span>
            </span>
          </div>
        </div>

        {!embedded && (
          <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-[#1A1217]/10 pt-4">
            {(me.role === 'admin' || me.role === 'head') && (
              <a href="/admin" className="v-btn v-btn-primary">
                <Shield className="h-4 w-4" aria-hidden="true" />
                <span>{me.role === 'admin' ? 'Open Admin Dashboard' : 'Open Review Portal'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            <a href="/" className="v-btn v-btn-secondary">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span>View Public Site</span>
            </a>
            <button type="button" onClick={() => sb.auth.signOut()} className="v-btn v-btn-secondary">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
        {embedded && onOpenAdmin && (
          <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-[#1A1217]/10 pt-4">
            <button type="button" onClick={onOpenAdmin} className="v-btn v-btn-primary">
              <span>Return to Dashboard</span>
            </button>
          </div>
        )}
      </section>

      <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-6">
        <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
              Announcements for You
            </h3>
          </div>
          <span className="text-xs tabular-nums text-[#1A1217]/60">
            {announcements.length} {announcements.length === 1 ? 'notice' : 'notices'}
          </span>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-[#1A1217]/65">Loading announcements...</p>
        ) : announcements.length === 0 ? (
          <p className="mt-4 text-sm text-[#1A1217]/65">No announcements posted for your role or department yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#1A1217]/10">
            {announcements.map(item => (
              <li key={item.id} className="py-4 first:pt-1 last:pb-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-display text-base font-semibold text-[#1A1217]">{item.title}</h4>
                  <time dateTime={item.created_at} className="text-xs tabular-nums text-[#1A1217]/60">
                    {formatDateTime(item.created_at)}
                  </time>
                </div>
                <p className="mt-1 text-xs font-medium text-[#2F6B34]">
                  {item.audience === 'all'
                    ? 'All Team Members'
                    : item.audience === 'heads'
                      ? 'Heads & Secretariat'
                      : `${item.target_department || 'Department'} Department`}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#1A1217]/85">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-[#EDE6D6] text-[#1A1217]">
      <header className="border-b border-[#1A1217]/12 bg-[#1A1217] px-6 py-4 text-[#EDE6D6]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Veritas MUN" className="h-8 w-8 object-contain" />
            <span className="font-display text-sm font-semibold tracking-wider uppercase">Veritas MUN Portal</span>
          </div>
          <span className="text-xs text-[#BAB1A0]">Welcome, {firstName}</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">{content}</main>
    </div>
  );
};
