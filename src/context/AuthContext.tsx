import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { navigate } from '../lib/router';
import type { ProfileRow } from '../types/database';

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  recoveryMode: boolean;
  setRecoveryMode: (val: boolean) => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<boolean>(false);

  const loadProfileForUser = useCallback(async (uid: string | undefined) => {
    if (!supabase || !uid) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      setProfile(null);
      return;
    }
    setProfile((data as ProfileRow | null) ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfileForUser(session?.user?.id);
  }, [loadProfileForUser, session?.user?.id]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        await loadProfileForUser(data.session?.user?.id);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: sub } = client.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);

      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        navigate('/login?mode=update-password', { replace: true });
      }

      if (nextSession?.user?.id) {
        await loadProfileForUser(nextSession.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileForUser]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRecoveryMode(false);
    navigate('/login');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        configured: isSupabaseConfigured,
        loading,
        session,
        user: session?.user ?? null,
        profile,
        recoveryMode,
        setRecoveryMode,
        refreshProfile,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
