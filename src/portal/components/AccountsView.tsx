import React, { useMemo, useState } from 'react';
import { KeyRound, Search } from 'lucide-react';
import {
  recordPortalAuditLog,
  sb,
  type PortalProfile
} from '../supabaseClient';
import { ConfirmModal } from './ConfirmModal';

interface AccountsViewProps {
  me: PortalProfile;
  profiles: PortalProfile[];
  loading: boolean;
  globalSearch?: string;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

interface PendingAccountAction {
  kind: 'role' | 'active';
  profile: PortalProfile;
  nextRole?: 'member' | 'head' | 'advisor' | 'admin';
  nextActive?: boolean;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  me,
  profiles,
  loading,
  globalSearch = '',
  onRefresh,
  onToast
}) => {
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAccountAction | null>(null);

  const effectiveQuery = (search || globalSearch).trim().toLowerCase();

  const filtered = useMemo(
    () =>
      profiles.filter(p => {
        if (!effectiveQuery) return true;
        return (
          (p.full_name || '').toLowerCase().includes(effectiveQuery) ||
          (p.email || '').toLowerCase().includes(effectiveQuery) ||
          (p.department || '').toLowerCase().includes(effectiveQuery) ||
          (p.position || '').toLowerCase().includes(effectiveQuery)
        );
      }),
    [profiles, effectiveQuery]
  );

  const applyPendingAction = async () => {
    if (!pendingAction) return;
    const { kind, profile, nextRole, nextActive } = pendingAction;
    setBusyId(profile.id);
    try {
      if (kind === 'role' && nextRole) {
        const { error } = await sb.from('profiles').update({ role: nextRole }).eq('id', profile.id);
        if (error) {
          onToast('error', error.message || 'Failed to update role.');
          return;
        }
        await recordPortalAuditLog(me.id, me.email, 'member.role_change', {
          target_user_id: profile.id,
          email: profile.email,
          from_role: profile.role,
          to_role: nextRole
        });
        onToast('success', `${profile.full_name} is now ${nextRole}.`);
      } else if (kind === 'active' && typeof nextActive === 'boolean') {
        const { error } = await sb.from('profiles').update({ active: nextActive }).eq('id', profile.id);
        if (error) {
          onToast('error', error.message || 'Failed to update account status.');
          return;
        }
        await recordPortalAuditLog(me.id, me.email, 'member.active_toggle', {
          target_user_id: profile.id,
          email: profile.email,
          active: nextActive
        });
        onToast('success', `${profile.full_name} marked ${nextActive ? 'active' : 'inactive'}.`);
      }
      setPendingAction(null);
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleSendPasswordReset = async (profile: PortalProfile) => {
    if (!profile.email) {
      onToast('error', 'No email address associated with this profile.');
      return;
    }
    setBusyId(profile.id);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/login`
      });
      if (error) {
        onToast('error', error.message || 'Could not send password reset email.');
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'member.password_reset_sent', {
        target_user_id: profile.id,
        email: profile.email
      });
      onToast('success', `Password reset email sent to ${profile.email}.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5 v-animate-in">
      <div className="border-b border-[#1A1217]/14 pb-4">
        <h2 className="font-display text-2xl font-semibold text-[#1A1217]">Accounts &amp; Access</h2>
        <p className="mt-1 text-sm text-[#1A1217]/70">
          Manage registered staff accounts, promote or restrict administrative roles, and toggle portal access.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-3.5">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/45" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search member accounts"
            placeholder="Filter signed-up accounts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="v-input pl-9"
          />
        </div>
        <span className="text-xs font-medium tabular-nums text-[#1A1217]/65">
          {filtered.length} signed-up {filtered.length === 1 ? 'account' : 'accounts'}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE]">
        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-11 w-full animate-pulse rounded-[2px] bg-[#EDE6D6]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-editorial text-xl italic text-[#1A1217]/75">
              No signed-up accounts match your search.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1A1217]/12 bg-[#F4EFE4] text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/70">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Department / Position</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Recovery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1217]/10 text-sm">
              {filtered.map(profile => {
                const isSelf = profile.id === me.id;
                return (
                  <tr key={profile.id} className="hover:bg-[#EDE6D6]/45 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1A1217]">
                        {profile.full_name} {isSelf ? '(You)' : ''}
                      </p>
                      <p className="text-xs text-[#1A1217]/65">{profile.email}</p>
                    </td>
                    <td className="px-4 py-3 text-[#1A1217]/85">
                      {profile.position || 'Member'}
                      {profile.department ? ` · ${profile.department}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${profile.full_name}`}
                        value={profile.role}
                        disabled={busyId === profile.id}
                        onChange={e => {
                          const nextRole = e.target.value as 'member' | 'head' | 'advisor' | 'admin';
                          if (nextRole !== profile.role) {
                            setPendingAction({ kind: 'role', profile, nextRole });
                          }
                        }}
                        className="v-input w-auto min-w-[115px] min-h-[36px] py-1 text-xs font-semibold uppercase tracking-wider"
                      >
                        <option value="member">Member</option>
                        <option value="head">Head</option>
                        <option value="advisor">Advisor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyId === profile.id}
                        onClick={() =>
                          setPendingAction({
                            kind: 'active',
                            profile,
                            nextActive: !profile.active
                          })
                        }
                        className={`v-status cursor-pointer transition ${
                          profile.active ? 'v-status-accepted' : 'v-status-rejected'
                        }`}
                      >
                        {profile.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyId === profile.id}
                        onClick={() => handleSendPasswordReset(profile)}
                        className="v-btn v-btn-secondary min-h-[34px] px-3 py-1 text-xs"
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Send Reset Email</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={Boolean(pendingAction)}
        title={pendingAction?.kind === 'role' ? 'Confirm Role Change' : 'Confirm Status Change'}
        description={
          pendingAction?.kind === 'role'
            ? `Change ${pendingAction.profile.full_name}'s role from "${pendingAction.profile.role}" to "${pendingAction.nextRole}"?`
            : pendingAction
              ? `${pendingAction.nextActive ? 'Reactivate' : 'Deactivate'} ${pendingAction.profile.full_name}'s portal access?`
              : ''
        }
        confirmLabel="Confirm Change"
        danger={pendingAction?.kind === 'active' && pendingAction.nextActive === false}
        busy={Boolean(busyId)}
        onCancel={() => setPendingAction(null)}
        onConfirm={applyPendingAction}
      />
    </div>
  );
};
