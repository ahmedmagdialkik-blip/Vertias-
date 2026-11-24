import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  FileEdit,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { AnnouncementsTab } from '../components/admin/AnnouncementsTab';
import { AuditLogTab } from '../components/admin/AuditLogTab';
import { ContentTab } from '../components/admin/ContentTab';
import { MembersTab } from '../components/admin/MembersTab';
import { OverviewTab } from '../components/admin/OverviewTab';
import { RosterTab } from '../components/admin/RosterTab';
import { SettingsTab } from '../components/admin/SettingsTab';
import { TeamCardsTab } from '../components/admin/TeamCardsTab';
import { PortalFrame } from '../components/PortalFrame';
import { ToastStack, type ToastMessage } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { navigate, RouterLink } from '../lib/router';
import { supabase } from '../lib/supabase';
import type { AnnouncementRow, AuditLogRow, ProfileRow, RosterRow } from '../types/database';
import { computeAdminAccess } from '../utils/portalLogic';

type AdminTab =
  | 'overview'
  | 'roster'
  | 'members'
  | 'content'
  | 'cards'
  | 'announcements'
  | 'settings'
  | 'audit';

const NAV_ITEMS: Array<{ key: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'roster', label: 'Roster', icon: Users },
  { key: 'members', label: 'Members', icon: UserCheck },
  { key: 'content', label: 'Site Content', icon: FileEdit },
  { key: 'cards', label: 'Team Cards', icon: ImageIcon },
  { key: 'announcements', label: 'Announcements', icon: Bell },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'audit', label: 'Audit Log', icon: History }
];

export const AdminPage: React.FC = () => {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const accessDecision = computeAdminAccess(authLoading, Boolean(user), profile);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((kind: 'success' | 'error', text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!supabase || accessDecision !== 'allow') return;
    setDataLoading(true);
    setDataError(null);
    try {
      const [rosterRes, profilesRes, auditRes, annRes] = await Promise.all([
        supabase.from('roster').select('*').order('full_name', { ascending: true }),
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('announcements').select('*').order('created_at', { ascending: false })
      ]);

      const err = rosterRes.error || profilesRes.error || auditRes.error || annRes.error;
      if (err) {
        setDataError(err.message || 'Unable to load admin records.');
      }
      if (rosterRes.data) setRoster(rosterRes.data as RosterRow[]);
      if (profilesRes.data) setProfiles(profilesRes.data as ProfileRow[]);
      if (auditRes.data) setAuditLogs(auditRes.data as AuditLogRow[]);
      if (annRes.data) setAnnouncements(annRes.data as AnnouncementRow[]);
    } finally {
      setDataLoading(false);
    }
  }, [accessDecision]);

  useEffect(() => {
    if (accessDecision === 'redirect_login') {
      navigate('/login?next=/admin', { replace: true });
    }
  }, [accessDecision]);

  useEffect(() => {
    if (accessDecision === 'allow') {
      loadAdminData();
    }
  }, [accessDecision, loadAdminData]);

  if (accessDecision === 'loading') {
    return (
      <PortalFrame title="Admin Panel" subtitle="Verifying permissions...">
        <div className="border border-[#EDE6D6]/20 bg-[#EDE6D6] p-8 text-[#1A1217]">
          <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg">Checking admin authorization...</p>
        </div>
      </PortalFrame>
    );
  }

  if (accessDecision === 'redirect_login') {
    return null;
  }

  if (accessDecision === 'access_denied') {
    return (
      <PortalFrame
        title="Access denied"
        subtitle="Administrator permissions are required to view this area."
      >
        <div className="border border-[#EDE6D6]/20 bg-[#EDE6D6] p-6 sm:p-8 text-[#1A1217] space-y-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-[#7C1E21]" aria-hidden="true" />
            <div>
              <h2 className="font-['Cinzel',serif] text-lg font-semibold uppercase tracking-wide text-[#7C1E21]">
                Access denied
              </h2>
              <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/85">
                Your account ({user?.email}) does not have active administrator privileges.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <RouterLink
              to="/account"
              className="inline-flex min-h-[42px] items-center bg-[#2F6B34] px-5 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#EDE6D6] no-underline hover:bg-[#1F4A25]"
            >
              Go to My Account
            </RouterLink>
            <RouterLink
              to="/"
              className="inline-flex min-h-[42px] items-center border border-[#1A1217]/25 bg-[#FAF6EE] px-5 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#1A1217] no-underline hover:border-[#1A1217]"
            >
              Return to Public Site
            </RouterLink>
          </div>
        </div>
      </PortalFrame>
    );
  }

  const currentNav = NAV_ITEMS.find(n => n.key === activeTab)!;

  return (
    <div className="min-h-screen bg-[#EDE6D6] text-[#1A1217] flex">
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-[#1A1217]/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-[#1A1217] text-[#EDE6D6] border-r border-[#EDE6D6]/15 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex items-center justify-between border-b border-[#EDE6D6]/15 px-5 py-4">
          <RouterLink to="/" className="flex items-center gap-3 text-[#EDE6D6] no-underline">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#4F9A57]/60 bg-[#EDE6D6] p-0.5">
              <img src="/logo.png" alt="Veritas MUN" className="h-full w-full rounded-full object-cover" />
            </span>
            <div>
              <span className="block font-['Cinzel',serif] text-xs font-semibold tracking-[0.12em] uppercase">
                Veritas MUN
              </span>
              <span className="block font-['Cormorant_Garamond',Georgia,serif] text-sm italic text-[#4F9A57]">
                Admin Console
              </span>
            </div>
          </RouterLink>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation drawer"
            className="p-1.5 text-[#EDE6D6]/75 hover:text-[#EDE6D6] lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActiveTab(item.key);
                  setSidebarOpen(false);
                }}
                className={`flex w-full min-h-[44px] items-center gap-3 px-3.5 py-2 text-left font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase transition ${
                  isActive
                    ? 'bg-[#2F6B34] text-[#EDE6D6]'
                    : 'text-[#EDE6D6]/80 hover:bg-[#EDE6D6]/10 hover:text-[#EDE6D6]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#EDE6D6]/15 p-4 space-y-3">
          <div>
            <p className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#EDE6D6] truncate">
              {profile?.full_name}
            </p>
            <p className="font-['Cormorant_Garamond',Georgia,serif] text-sm italic text-[#EDE6D6]/70 truncate">
              {profile?.position} &middot; Admin
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RouterLink
              to="/account"
              className="inline-flex min-h-[36px] flex-1 items-center justify-center border border-[#EDE6D6]/25 px-2.5 py-1 font-['Cinzel',serif] text-[10px] font-semibold uppercase tracking-wider text-[#EDE6D6] no-underline hover:border-[#4F9A57]"
            >
              My Account
            </RouterLink>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex min-h-[36px] items-center justify-center gap-1 border border-[#EDE6D6]/25 px-2.5 py-1 font-['Cinzel',serif] text-[10px] font-semibold uppercase tracking-wider text-[#EDE6D6] hover:border-[#4F9A57]"
            >
              <LogOut className="h-3 w-3" aria-hidden="true" />
              <span>Out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#1A1217]/15 bg-[#EDE6D6]/95 px-4 py-3.5 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-10 w-10 items-center justify-center border border-[#1A1217]/20 bg-[#FAF6EE] text-[#1A1217] lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="font-['Cinzel',serif] text-xl sm:text-2xl font-semibold tracking-[0.04em] text-[#1A1217]">
              {currentNav.label}
            </h1>
          </div>

          <RouterLink
            to="/"
            className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap border border-[#1A1217]/20 bg-[#FAF6EE] px-4 py-1.5 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#1A1217] no-underline hover:border-[#2F6B34] hover:text-[#2F6B34]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>View Public Site</span>
          </RouterLink>
        </header>

        <main className="flex-1 p-4 sm:p-8">
          {dataError ? (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 border border-[#7C1E21]/40 bg-[#FBECEC] px-4 py-3 text-[#6E171B]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="font-['Cormorant_Garamond',Georgia,serif] text-base font-medium">
                {dataError}
              </p>
            </div>
          ) : null}

          {activeTab === 'overview' ? (
            <OverviewTab
              roster={roster}
              profiles={profiles}
              auditLogs={auditLogs}
              loading={dataLoading}
              onJumpToTab={tab => setActiveTab(tab)}
            />
          ) : null}

          {activeTab === 'roster' ? (
            <RosterTab
              roster={roster}
              profiles={profiles}
              loading={dataLoading}
              onRefresh={loadAdminData}
              onToast={pushToast}
            />
          ) : null}

          {activeTab === 'members' ? (
            <MembersTab
              profiles={profiles}
              currentUserId={user?.id || ''}
              loading={dataLoading}
              onRefresh={loadAdminData}
              onToast={pushToast}
            />
          ) : null}

          {activeTab === 'content' ? <ContentTab onToast={pushToast} /> : null}

          {activeTab === 'cards' ? <TeamCardsTab onToast={pushToast} /> : null}

          {activeTab === 'announcements' ? (
            <AnnouncementsTab
              announcements={announcements}
              roster={roster}
              loading={dataLoading}
              onRefresh={loadAdminData}
              onToast={pushToast}
            />
          ) : null}

          {activeTab === 'settings' ? <SettingsTab onToast={pushToast} /> : null}

          {activeTab === 'audit' ? (
            <AuditLogTab logs={auditLogs} loading={dataLoading} />
          ) : null}
        </main>
      </div>

      <ToastStack
        toasts={toasts}
        onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))}
      />
    </div>
  );
};
