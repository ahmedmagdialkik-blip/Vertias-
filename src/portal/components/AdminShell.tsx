import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ExternalLink,
  Globe,
  HeartHandshake,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCircle,
  UserCog,
  Users,
  X
} from 'lucide-react';
import {
  buildPortalNotifications,
  formatShortDate,
  getAuthorizedNavItems,
  getDefaultSectionForRole,
  isSectionAuthorized,
  type AdminNavGroup,
  type AdminNavItem,
  type AdminSectionId
} from '../../utils/portalAdminLogic';
import {
  sb,
  type PortalAnnouncement,
  type PortalApplication,
  type PortalAuditEntry,
  type PortalProfile,
  type PortalRosterEntry
} from '../supabaseClient';
import { AccountView } from './AccountView';
import { AccountsView } from './AccountsView';
import { AnnouncementsView } from './AnnouncementsView';
import { ApplicationsManagementView } from './ApplicationsManagementView';
import { ApplicationsView } from './ApplicationsView';
import { CommitteesManagementView } from './CommitteesManagementView';
import { ContentView } from './ContentView';
import { DashboardOverview } from './DashboardOverview';
import { RosterView } from './RosterView';
import { SettingsView } from './SettingsView';
import { ToastBanner, type ToastMessage } from './ToastBanner';

interface AdminShellProps {
  me: PortalProfile;
}

const SECTION_ICONS: Record<AdminSectionId, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  overview: LayoutDashboard,
  all_applications: Inbox,
  security_applications: ShieldCheck,
  volunteer_applications: HeartHandshake,
  roster: Users,
  accounts: UserCog,
  announcements: Megaphone,
  committees_management: Landmark,
  applications_management: SlidersHorizontal,
  content: Globe,
  settings: Settings,
  account: UserCircle
};

const GROUP_ORDER: AdminNavGroup[] = ['Workspace', 'Applications', 'Administration', 'Site & System'];

export const AdminShell: React.FC<AdminShellProps> = ({ me }) => {
  const isAdmin = me.role === 'admin';
  const authorizedNav = useMemo(
    () => getAuthorizedNavItems(me.role, me.department),
    [me.role, me.department]
  );

  const [activeSection, setActiveSection] = useState<AdminSectionId>(() =>
    getDefaultSectionForRole(me.role, me.department)
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const [applications, setApplications] = useState<PortalApplication[]>([]);
  const [roster, setRoster] = useState<PortalRosterEntry[]>([]);
  const [profiles, setProfiles] = useState<PortalProfile[]>([]);
  const [announcements, setAnnouncements] = useState<PortalAnnouncement[]>([]);
  const [auditLogs, setAuditLogs] = useState<PortalAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((kind: 'success' | 'error', text: string) => {
    setToast({ id: Date.now(), kind, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Keep active section strictly within authorized routes if role/department changes
  useEffect(() => {
    if (!isSectionAuthorized(activeSection, me.role, me.department)) {
      setActiveSection(getDefaultSectionForRole(me.role, me.department));
    }
  }, [activeSection, me.role, me.department]);

  useEffect(() => {
    document.title = `Veritas MUN | ${isAdmin ? 'Admin Dashboard' : 'Application Review'}`;
  }, [isAdmin]);

  // Close header popovers on outside click / Escape
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const loadPortalData = useCallback(async () => {
    setLoading(true);
    setDataError('');
    try {
      if (isAdmin) {
        const [appsRes, rosterRes, profilesRes, annRes, logsRes] = await Promise.all([
          sb.from('applications').select('*').order('created_at', { ascending: false }),
          sb.from('roster').select('*').order('full_name', { ascending: true }),
          sb.from('profiles').select('*').order('created_at', { ascending: true }),
          sb.from('announcements').select('*').order('created_at', { ascending: false }),
          sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(150)
        ]);
        const firstErr =
          appsRes.error || rosterRes.error || profilesRes.error || annRes.error || logsRes.error;
        if (firstErr) setDataError(firstErr.message);
        setApplications((appsRes.data as PortalApplication[]) || []);
        setRoster((rosterRes.data as PortalRosterEntry[]) || []);
        setProfiles((profilesRes.data as PortalProfile[]) || []);
        setAnnouncements((annRes.data as PortalAnnouncement[]) || []);
        setAuditLogs((logsRes.data as PortalAuditEntry[]) || []);
      } else {
        const [appsRes, annRes] = await Promise.all([
          sb.from('applications').select('*').order('created_at', { ascending: false }),
          sb.from('announcements').select('*').order('created_at', { ascending: false })
        ]);
        const firstErr = appsRes.error || annRes.error;
        if (firstErr) setDataError(firstErr.message);
        setApplications((appsRes.data as PortalApplication[]) || []);
        setAnnouncements((annRes.data as PortalAnnouncement[]) || []);
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  const navigateToSection = useCallback(
    (section: AdminSectionId, applicationId?: string) => {
      if (!isSectionAuthorized(section, me.role, me.department)) return;
      setActiveSection(section);
      setMobileMenuOpen(false);
      setNotifOpen(false);
      setProfileMenuOpen(false);
      if (applicationId) {
        setSelectedApplicationId(applicationId);
      }
    },
    [me.role, me.department]
  );

  const writeAuditLog = useCallback(
    async (action: string, details: Record<string, unknown> = {}) => {
      await sb.from('audit_logs').insert({
        actor_id: me.id,
        actor_email: me.email,
        action,
        details
      });
    },
    [me.id, me.email]
  );

  const notifications = useMemo(
    () => buildPortalNotifications(applications, announcements, me),
    [applications, announcements, me]
  );

  const groupedNav = useMemo(() => {
    const map = new Map<AdminNavGroup, AdminNavItem[]>();
    for (const g of GROUP_ORDER) {
      const items = authorizedNav.filter(i => i.group === g);
      if (items.length > 0) map.set(g, items);
    }
    return map;
  }, [authorizedNav]);

  const currentNavMeta =
    authorizedNav.find(i => i.id === activeSection) ?? authorizedNav[0];

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    if (
      activeSection !== 'all_applications' &&
      activeSection !== 'security_applications' &&
      activeSection !== 'volunteer_applications' &&
      activeSection !== 'roster' &&
      activeSection !== 'accounts'
    ) {
      const target = isAdmin
        ? 'all_applications'
        : getDefaultSectionForRole(me.role, me.department);
      navigateToSection(target);
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#1A1217] text-[#EDE6D6]">
      {/* Brand header */}
      <div className="flex items-center justify-between border-b border-[#EDE6D6]/12 px-5 py-5">
        <a href="/" className="flex items-center gap-3 text-[#EDE6D6] no-underline">
          <img
            src="/logo.png"
            alt="Veritas MUN"
            className="h-9 w-9 shrink-0 rounded-full object-cover border border-[#BAB1A0]/40"
          />
          <div className="min-w-0">
            <span className="block font-display text-sm font-semibold tracking-wider uppercase truncate">
              Veritas MUN
            </span>
            <span className="block text-[11px] font-medium text-[#BAB1A0] truncate">
              {isAdmin ? 'Executive Board' : `${me.department || 'Department'} Review`}
            </span>
          </div>
        </a>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="rounded-[2px] p-1.5 text-[#BAB1A0] hover:text-[#EDE6D6] lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Grouped Navigation */}
      <nav aria-label="Portal sections" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {Array.from(groupedNav.entries()).map(([groupName, items]) => (
          <div key={groupName}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#BAB1A0]/70">
              {groupName}
            </p>
            <ul className="space-y-1">
              {items.map(item => {
                const Icon = SECTION_ICONS[item.id];
                const isActive = item.id === activeSection;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigateToSection(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex w-full items-center gap-3 rounded-[2px] px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#2F6B34] text-[#FAF6EE]'
                          : 'text-[#EDE6D6]/80 hover:bg-[#EDE6D6]/10 hover:text-[#FAF6EE]'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? 'text-[#FAF6EE]' : 'text-[#BAB1A0]'
                        }`}
                        aria-hidden={true}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom utilities */}
      <div className="border-t border-[#EDE6D6]/12 p-3 space-y-1">
        <a
          href="/"
          className="flex items-center gap-3 rounded-[2px] px-3 py-2 text-sm font-medium text-[#BAB1A0] hover:bg-[#EDE6D6]/10 hover:text-[#EDE6D6] no-underline"
        >
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>View Public Site</span>
        </a>
        <button
          type="button"
          onClick={() => sb.auth.signOut()}
          className="flex w-full items-center gap-3 rounded-[2px] px-3 py-2 text-left text-sm font-medium text-[#BAB1A0] hover:bg-[#8A2B2B]/30 hover:text-[#EDE6D6]"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#EDE6D6] text-[#1A1217]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-[#1A1217]/15 lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#1A1217]/65"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 h-full w-72 max-w-[85vw] shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-[#1A1217]/14 bg-[#FAF6EE] px-4 py-3 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                className="rounded-[2px] border border-[#1A1217]/15 p-2 text-[#1A1217] hover:bg-[#EDE6D6] lg:hidden"
              >
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>

              <div className="min-w-0">
                <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-[#1A1217]/55">
                  <span>Veritas MUN</span>
                  <span aria-hidden="true">/</span>
                  <span className="truncate">{currentNavMeta?.group || 'Workspace'}</span>
                  <span aria-hidden="true">/</span>
                  <span className="text-[#2F6B34] font-semibold truncate">
                    {currentNavMeta?.breadcrumb}
                  </span>
                </div>
                <h1 className="font-display text-base sm:text-lg font-semibold text-[#1A1217] truncate">
                  {currentNavMeta?.label}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* Working Global Search */}
              <form onSubmit={handleGlobalSearchSubmit} className="relative hidden md:block w-56 lg:w-64">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1A1217]/45"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Quick search portal"
                  placeholder="Search applicants, staff..."
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  className="v-input min-h-[36px] bg-[#EDE6D6]/50 pl-8 py-1 text-xs"
                />
              </form>

              {/* Real Notifications Popover */}
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen(v => !v);
                    setProfileMenuOpen(false);
                  }}
                  aria-expanded={notifOpen}
                  aria-label={`Notifications (${notifications.length})`}
                  className="relative inline-flex min-h-[38px] items-center gap-1.5 rounded-[2px] border border-[#1A1217]/15 bg-[#EDE6D6]/50 px-2.5 py-1.5 text-xs font-semibold text-[#1A1217] hover:border-[#1A1217]/35"
                >
                  <Bell className="h-4 w-4 text-[#1A1217]/80" aria-hidden="true" />
                  {notifications.length > 0 && (
                    <span className="tabular-nums text-[11px] font-semibold text-[#2F6B34]">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div
                    role="region"
                    aria-label="Recent notifications"
                    className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-[2px] border border-[#1A1217]/20 bg-[#FAF6EE] shadow-xl z-40 v-animate-in"
                  >
                    <div className="flex items-center justify-between border-b border-[#1A1217]/12 px-4 py-3">
                      <span className="font-display text-xs font-semibold uppercase tracking-wider text-[#1A1217]">
                        Notifications
                      </span>
                      <span className="text-[11px] tabular-nums text-[#1A1217]/60">
                        {notifications.length} active
                      </span>
                    </div>

                    {notifications.length === 0 ? (
                      <p className="p-5 text-center text-xs text-[#1A1217]/65">
                        You are caught up. No pending items or notices.
                      </p>
                    ) : (
                      <ul className="max-h-80 divide-y divide-[#1A1217]/10 overflow-y-auto">
                        {notifications.map(item => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => navigateToSection(item.targetSection, item.targetApplicationId)}
                              className="w-full px-4 py-3 text-left hover:bg-[#EDE6D6]/50 transition-colors"
                            >
                              <p className="text-xs font-semibold text-[#1A1217] leading-snug">
                                {item.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#1A1217]/65 truncate">
                                {item.subtitle}
                              </p>
                              {item.timestamp && (
                                <p className="mt-1 text-[10px] tabular-nums text-[#2F6B34] font-medium">
                                  {formatShortDate(item.timestamp)}
                                </p>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Profile Dropdown */}
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(v => !v);
                    setNotifOpen(false);
                  }}
                  aria-expanded={profileMenuOpen}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-[2px] border border-[#1A1217]/15 bg-[#EDE6D6]/50 px-2.5 py-1.5 text-left hover:border-[#1A1217]/35"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] bg-[#1A1217] font-display text-xs font-semibold text-[#EDE6D6]">
                    {(me.full_name || 'V').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:block max-w-[140px] truncate text-xs font-semibold text-[#1A1217]">
                    {me.full_name}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#1A1217]/60" aria-hidden="true" />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-[2px] border border-[#1A1217]/20 bg-[#FAF6EE] shadow-xl z-40 v-animate-in">
                    <div className="border-b border-[#1A1217]/12 px-4 py-3">
                      <p className="text-xs font-semibold text-[#1A1217] truncate">{me.full_name}</p>
                      <p className="text-[11px] text-[#1A1217]/65 truncate">{me.email}</p>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#2F6B34]">
                        {me.position || me.role}
                        {me.department ? ` · ${me.department}` : ''}
                      </p>
                    </div>
                    <div className="p-1.5 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => navigateToSection('account')}
                        className="flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-left text-xs font-medium text-[#1A1217] hover:bg-[#EDE6D6]/60"
                      >
                        <UserCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>My Account</span>
                      </button>
                      <a
                        href="/"
                        className="flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-xs font-medium text-[#1A1217] hover:bg-[#EDE6D6]/60 no-underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Public Website</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => sb.auth.signOut()}
                        className="flex w-full items-center gap-2 rounded-[2px] px-3 py-2 text-left text-xs font-medium text-[#8A2B2B] hover:bg-[#8A2B2B]/10"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Workspace Canvas */}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-7 sm:py-7">
          {activeSection === 'overview' && isAdmin && (
            <DashboardOverview
              me={me}
              applications={applications}
              roster={roster}
              profiles={profiles}
              auditLogs={auditLogs}
              loading={loading}
              onNavigate={navigateToSection}
            />
          )}

          {activeSection === 'all_applications' && (
            <ApplicationsView
              me={me}
              applications={applications}
              loading={loading}
              error={dataError}
              globalSearch={globalSearch}
              initialSelectedId={selectedApplicationId}
              onClearInitialSelected={() => setSelectedApplicationId(null)}
              onRefresh={loadPortalData}
              onToast={showToast}
            />
          )}

          {activeSection === 'security_applications' && (
            <ApplicationsView
              me={me}
              applications={applications}
              loading={loading}
              error={dataError}
              fixedTrack="Security"
              globalSearch={globalSearch}
              initialSelectedId={selectedApplicationId}
              onClearInitialSelected={() => setSelectedApplicationId(null)}
              onRefresh={loadPortalData}
              onToast={showToast}
            />
          )}

          {activeSection === 'volunteer_applications' && (
            <ApplicationsView
              me={me}
              applications={applications}
              loading={loading}
              error={dataError}
              fixedTrack="Volunteers"
              globalSearch={globalSearch}
              initialSelectedId={selectedApplicationId}
              onClearInitialSelected={() => setSelectedApplicationId(null)}
              onRefresh={loadPortalData}
              onToast={showToast}
            />
          )}

          {activeSection === 'roster' && isAdmin && (
            <RosterView
              me={me}
              roster={roster}
              profiles={profiles}
              loading={loading}
              globalSearch={globalSearch}
              onRefresh={loadPortalData}
              onToast={showToast}
            />
          )}

          {activeSection === 'accounts' && isAdmin && (
            <AccountsView
              me={me}
              profiles={profiles}
              loading={loading}
              globalSearch={globalSearch}
              onRefresh={loadPortalData}
              onToast={showToast}
            />
          )}

          {activeSection === 'announcements' && isAdmin && (
            <AnnouncementsView
              me={me}
              announcements={announcements}
              roster={roster}
              loading={loading}
              onRefresh={loadPortalData}
              onToast={showToast}
            />
          )}

          {activeSection === 'committees_management' && isAdmin && (
            <CommitteesManagementView sb={sb} log={writeAuditLog} />
          )}

          {activeSection === 'applications_management' && isAdmin && (
            <ApplicationsManagementView sb={sb} log={writeAuditLog} />
          )}

          {activeSection === 'content' && isAdmin && (
            <ContentView me={me} onToast={showToast} />
          )}

          {activeSection === 'settings' && isAdmin && (
            <SettingsView
              me={me}
              auditLogs={auditLogs}
              loadingLogs={loading}
              onRefresh={loadPortalData}
              onToast={showToast}
            />
          )}

          {activeSection === 'account' && (
            <AccountView
              me={me}
              embedded={true}
              onOpenAdmin={() => navigateToSection(getDefaultSectionForRole(me.role, me.department))}
            />
          )}
        </main>
      </div>

      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
