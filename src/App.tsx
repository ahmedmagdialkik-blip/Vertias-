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
        .order('created_at', { ascending: true })
    ])
      .then(([contentRes, cardsRes, committeesRes]) => {
        if (cancelled) return;
        const content = mergeSiteContentWithFallback(contentRes.data ?? []);
        const cards =
          Array.isArray(cardsRes.data) && cardsRes.data.length > 0
            ? (cardsRes.data as TeamCardRow[])
            : DEFAULT_TEAM_CARDS;
        const committees = committeesRes.error
          ? undefined
          : normalizeCommitteeRows(committeesRes.data ?? []).filter(c => c.enabled);
        window.__veritasApplyPublicData?.({ content, teamCards: cards, committees });
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
