import React, { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { isPortalPathname, useLocationState } from './lib/router';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import type { TeamCardRow } from './types/database';
import { normalizeCommitteeRows } from './utils/committeesAndSettingsLogic';
import {
  normalizeEbDepartmentRows,
  normalizeEbMemberRows
} from './utils/executiveBoardLogic';
import { DEFAULT_TEAM_CARDS, mergeSiteContentWithFallback } from './utils/portalLogic';

const PublicSiteSync: React.FC<{ active: boolean }> = ({ active }) => {

  useEffect(() => {
    if (!active || !isSupabaseConfigured || !supabase) return;

    let cancelled = false;
    Promise.all([
      supabase.from('site_content').select('key, value'),
      supabase
        .from('team_cards')
        .select('*')
        .eq('visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('committees')
        .select('*')
        .eq('enabled', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('eb_departments').select('*').order('sort_order', { ascending: true }),
      supabase.from('eb_members').select('*').order('sort_order', { ascending: true }),
      supabase.from('schedule_days').select('*').eq('published', true).order('day_number', { ascending: true }).order('sort_order', { ascending: true }),
      supabase.from('schedule_sessions').select('*').eq('published', true).order('sort_order', { ascending: true }).order('start_time', { ascending: true }),
      supabase.from('faqs').select('*').eq('published', true).order('sort_order', { ascending: true }),
      supabase.from('conference_documents').select('*').eq('published', true).eq('audience', 'public').order('sort_order', { ascending: true }),
      supabase.from('sponsors').select('*').eq('published', true).order('sort_order', { ascending: true }),
      supabase.from('gallery_items').select('*').eq('published', true).order('sort_order', { ascending: true })
    ])
      .then(([contentRes, cardsRes, committeesRes, ebDeptsRes, ebMembersRes, daysRes, sessRes, faqRes, docRes, spRes, galRes]) => {
        if (cancelled) return;
        const content = mergeSiteContentWithFallback(contentRes.data ?? []);
        const cards =
          Array.isArray(cardsRes.data) && cardsRes.data.length > 0
            ? (cardsRes.data as TeamCardRow[])
            : DEFAULT_TEAM_CARDS;
        const committees = committeesRes.error
          ? undefined
          : normalizeCommitteeRows(committeesRes.data ?? []).filter(c => c.enabled);
        const ebDepartments = !ebDeptsRes.error && Array.isArray(ebDeptsRes.data) && ebDeptsRes.data.length > 0
          ? normalizeEbDepartmentRows(ebDeptsRes.data)
          : undefined;
        const ebMembers = !ebMembersRes.error && Array.isArray(ebMembersRes.data) && ebMembersRes.data.length > 0
          ? normalizeEbMemberRows(ebMembersRes.data)
          : undefined;
        window.__veritasApplyPublicData?.({
          content,
          teamCards: cards,
          committees,
          ebDepartments,
          ebMembers,
          scheduleDays: daysRes.error ? undefined : daysRes.data ?? [],
          scheduleSessions: sessRes.error ? undefined : sessRes.data ?? [],
          faqs: faqRes.error ? undefined : faqRes.data ?? [],
          documents: docRes.error ? undefined : docRes.data ?? [],
          sponsors: spRes.error ? undefined : spRes.data ?? [],
          gallery: galRes.error ? undefined : galRes.data ?? []
        });
      })
      .catch(() => {
        // Keep built-in fallback content on transient network failure
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return null;
};

const RouteView: React.FC = () => {
  const { pathname } = useLocationState();
  const isPortal = isPortalPathname(pathname);

  useEffect(() => {
    document.documentElement.classList.toggle('is-portal-route', isPortal);
    window.__veritasSetPortalMode?.(isPortal, { skipIntro: !isPortal });
  }, [isPortal]);

  if (!isPortal) {
    return <PublicSiteSync active={true} />;
  }

  return (
    <>
      <PublicSiteSync active={false} />
      {pathname === '/login' ? <LoginPage /> : null}
      {pathname === '/signup' ? <SignupPage /> : null}
      {pathname === '/account' ? <AccountPage /> : null}
      {pathname === '/admin' ? <AdminPage /> : null}
    </>
  );
};

export function App() {
  return (
    <AuthProvider>
      <RouteView />
    </AuthProvider>
  );
}

export default App;
