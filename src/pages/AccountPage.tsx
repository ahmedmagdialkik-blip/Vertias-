import React, { useEffect, useState } from 'react';
import { Bell, LogOut, ShieldCheck } from 'lucide-react';
import { PortalFrame } from '../components/PortalFrame';
import { useAuth } from '../context/AuthContext';
import { navigate, RouterLink } from '../lib/router';
import { supabase } from '../lib/supabase';
import type { AnnouncementRow } from '../types/database';
import { canMemberViewAnnouncement, formatMemberWelcome } from '../utils/portalLogic';

export const AccountPage: React.FC = () => {
  const { user, profile, loading, signOut } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login?next=/account', { replace: true });
    }
  }, [loading, user]);

  useEffect(() => {
    if (!supabase || !user || !profile?.active) {
      setLoadingAnnouncements(false);
      return;
    }

    let cancelled = false;
    setLoadingAnnouncements(true);

    supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = ((data as AnnouncementRow[] | null) ?? []).filter(a =>
          canMemberViewAnnouncement(a, profile)
        );
        setAnnouncements(rows);
        setLoadingAnnouncements(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);
    if (!supabase) return;
    if (newPassword.length < 10) {
      setPwError('Password must be at least 10 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }

    setPwBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwError(error.message || 'Could not update password.');
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
      setPwSuccess('Password updated.');
    } finally {
      setPwBusy(false);
    }
  };

  if (loading) {
    return (
      <PortalFrame title="Team Account" subtitle="Loading your profile...">
        <div className="border border-[#EDE6D6]/20 bg-[#EDE6D6] p-8 text-[#1A1217]">
          <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg">Checking session...</p>
        </div>
      </PortalFrame>
    );
  }

  if (!user) return null;

  const welcomeHeadline = profile
    ? formatMemberWelcome(profile)
    : `Welcome, ${user.email || 'Team Member'}`;

  return (
    <PortalFrame
      title={welcomeHeadline}
      subtitle="Veritas MUN organizing team portal"
      maxWidthClass="max-w-4xl"
      headerRight={
        <div className="flex flex-wrap items-center gap-3">
          {profile?.role === 'admin' && profile.active ? (
            <RouterLink
              to="/admin"
              className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap border border-[#4F9A57] bg-[#2F6B34] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-[0.1em] uppercase text-[#EDE6D6] no-underline hover:bg-[#1F4A25]"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Admin Panel</span>
            </RouterLink>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap border border-[#EDE6D6]/30 px-4 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-[0.1em] uppercase text-[#EDE6D6] hover:border-[#4F9A57] hover:text-[#4F9A57]"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      }
    >
      {profile && !profile.active ? (
        <div className="border border-[#B9383C] bg-[#EDE6D6] p-6 text-[#6E171B] mb-6">
          <h2 className="font-['Cinzel',serif] text-base font-semibold uppercase tracking-wider">
            Account Inactive
          </h2>
          <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-lg">
            Your team account is currently marked inactive. Contact a Veritas MUN administrator if you believe this is a mistake.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-12">
        <section className="md:col-span-5 border border-[#EDE6D6]/20 bg-[#EDE6D6] p-6 text-[#1A1217]">
          <h2 className="border-b border-[#1A1217]/15 pb-3 font-['Cinzel',serif] text-sm font-semibold tracking-[0.1em] uppercase text-[#1A1217]">
            Member Details
          </h2>

          {profile ? (
            <dl className="mt-4 divide-y divide-[#1A1217]/10 font-['Cormorant_Garamond',Georgia,serif] text-lg">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#1A1217]/65">Full Name</dt>
                <dd className="text-right font-semibold">{profile.full_name}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#1A1217]/65">Email</dt>
                <dd className="text-right break-all">{user.email || profile.email}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#1A1217]/65">Position</dt>
                <dd className="text-right">{profile.position || '—'}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#1A1217]/65">Department</dt>
                <dd className="text-right">{profile.department || '—'}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#1A1217]/65">Portal Role</dt>
                <dd className="text-right font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider self-center">
                  {profile.role}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-[#1A1217]/65">Status</dt>
                <dd className="text-right font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider self-center text-[#2F6B34]">
                  {profile.active ? 'Active' : 'Inactive'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/80">
              Signed in as {user.email}. Your profile record is pending administrator assignment.
            </p>
          )}

          <div className="mt-8 border-t border-[#1A1217]/15 pt-5">
            <h3 className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.1em] uppercase text-[#1A1217]">
              Update Password
            </h3>
            <form onSubmit={handlePasswordChange} className="mt-3 space-y-3">
              {pwError ? (
                <p className="text-sm font-medium text-[#7C1E21]" role="alert">{pwError}</p>
              ) : null}
              {pwSuccess ? (
                <p className="text-sm font-medium text-[#2F6B34]" role="status">{pwSuccess}</p>
              ) : null}
              <div>
                <label htmlFor="acct-new-pw" className="block text-sm text-[#1A1217]/80">
                  New password (10+ chars)
                </label>
                <input
                  id="acct-new-pw"
                  type="password"
                  minLength={10}
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="mt-1 w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                />
              </div>
              <div>
                <label htmlFor="acct-confirm-pw" className="block text-sm text-[#1A1217]/80">
                  Confirm new password
                </label>
                <input
                  id="acct-confirm-pw"
                  type="password"
                  minLength={10}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full min-h-[40px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                />
              </div>
              <button
                type="submit"
                disabled={pwBusy}
                className="min-h-[42px] w-full bg-[#1A1217] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-[0.1em] uppercase text-[#EDE6D6] hover:bg-[#2F6B34] transition-colors disabled:opacity-60"
              >
                {pwBusy ? 'Saving...' : 'Change Password'}
              </button>
            </form>
          </div>
        </section>

        <section className="md:col-span-7 border border-[#EDE6D6]/20 bg-[#EDE6D6] p-6 text-[#1A1217]">
          <div className="flex items-center justify-between gap-3 border-b border-[#1A1217]/15 pb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
              <h2 className="font-['Cinzel',serif] text-sm font-semibold tracking-[0.1em] uppercase text-[#1A1217]">
                Announcements
              </h2>
            </div>
            <span className="font-['Cormorant_Garamond',Georgia,serif] text-sm italic text-[#1A1217]/70 tabular-nums">
              {announcements.length} {announcements.length === 1 ? 'message' : 'messages'}
            </span>
          </div>

          {loadingAnnouncements ? (
            <p className="mt-6 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/70">
              Loading announcements...
            </p>
          ) : announcements.length === 0 ? (
            <div className="mt-6 border border-[#1A1217]/15 bg-[#FAF6EE] p-6">
              <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg italic text-[#1A1217]/75">
                No announcements for your role or department yet.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {announcements.map(item => (
                <li
                  key={item.id}
                  className="border border-[#1A1217]/15 bg-[#FAF6EE] p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-['Cinzel',serif] text-base font-semibold text-[#1A1217]">
                      {item.title}
                    </h3>
                    <span className="font-['Cormorant_Garamond',Georgia,serif] text-sm tabular-nums text-[#1A1217]/65">
                      {item.audience === 'all'
                        ? 'All Team'
                        : item.audience === 'heads'
                          ? 'Heads Only'
                          : `${item.target_department || 'Department'} Dept`}{' '}
                      &middot; {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line font-['Cormorant_Garamond',Georgia,serif] text-lg leading-relaxed text-[#1A1217]/90">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PortalFrame>
  );
};
