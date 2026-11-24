import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { recordAuditLog, supabase } from '../../lib/supabase';
import type { ProfileRow, UserRole } from '../../types/database';
import { ConfirmModal } from '../ConfirmModal';

interface MembersTabProps {
  profiles: ProfileRow[];
  currentUserId: string;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

interface PendingAction {
  kind: 'role' | 'active';
  profile: ProfileRow;
  nextRole?: UserRole;
  nextActive?: boolean;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  profiles,
  currentUserId,
  loading,
  onRefresh,
  onToast
}) => {
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const filtered = profiles.filter(p => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.department.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q)
    );
  });

  const applyPendingAction = async () => {
    if (!supabase || !pendingAction) return;
    const { kind, profile, nextRole, nextActive } = pendingAction;
    setBusyId(profile.id);
    try {
      if (kind === 'role' && nextRole) {
        const { error } = await supabase
          .from('profiles')
          .update({ role: nextRole })
          .eq('id', profile.id);
        if (error) {
          onToast('error', error.message || 'Failed to update role.');
          return;
        }
        await recordAuditLog('member.role_change', {
          target_user_id: profile.id,
          email: profile.email,
          from_role: profile.role,
          to_role: nextRole
        });
        onToast('success', `${profile.full_name} is now ${nextRole}.`);
      } else if (kind === 'active' && typeof nextActive === 'boolean') {
        const { error } = await supabase
          .from('profiles')
          .update({ active: nextActive })
          .eq('id', profile.id);
        if (error) {
          onToast('error', error.message || 'Failed to update account status.');
          return;
        }
        await recordAuditLog('member.active_toggle', {
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

  const handleSendPasswordReset = async (profile: ProfileRow) => {
    if (!supabase || !profile.email) {
      onToast('error', 'No email address associated with this profile.');
      return;
    }
    setBusyId(profile.id);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${window.location.origin}/login?mode=update-password`
      });
      if (error) {
        onToast('error', error.message || 'Could not send password reset email.');
        return;
      }
      await recordAuditLog('member.password_reset_sent', {
        target_user_id: profile.id,
        email: profile.email
      });
      onToast('success', `Password reset link sent to ${profile.email}.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#1A1217]/15 bg-[#FAF6EE] p-4">
        <input
          type="search"
          aria-label="Search member accounts"
          placeholder="Filter signed-up accounts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md min-h-[42px] border border-[#1A1217]/20 bg-[#EDE6D6]/50 px-3.5 py-1.5 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217] focus:border-[#2F6B34] focus:outline-none"
        />
        <span className="font-['Cormorant_Garamond',Georgia,serif] text-base tabular-nums text-[#1A1217]/75">
          {filtered.length} signed-up {filtered.length === 1 ? 'account' : 'accounts'}
        </span>
      </div>

      <div className="border border-[#1A1217]/15 bg-[#FAF6EE] overflow-x-auto">
        {loading ? (
          <p className="p-6 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/75">
            Loading accounts...
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center font-['Cormorant_Garamond',Georgia,serif] text-xl italic text-[#1A1217]/75">
            No signed-up accounts match your search.
          </p>
        ) : (
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1A1217]/15 bg-[#EDE6D6]/60 font-['Cinzel',serif] text-[11px] font-semibold tracking-[0.08em] uppercase text-[#1A1217]/80">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Department / Position</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Security</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1217]/10 font-['Cormorant_Garamond',Georgia,serif] text-base">
              {filtered.map(profile => {
                const isSelf = profile.id === currentUserId;
                return (
                  <tr key={profile.id} className="hover:bg-[#EDE6D6]/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1A1217]">
                        {profile.full_name} {isSelf ? '(You)' : ''}
                      </p>
                      <p className="text-sm text-[#1A1217]/70">{profile.email}</p>
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
                          const nextRole = e.target.value as UserRole;
                          if (nextRole !== profile.role) {
                            setPendingAction({ kind: 'role', profile, nextRole });
                          }
                        }}
                        className="min-h-[36px] border border-[#1A1217]/25 bg-[#EDE6D6] px-2.5 py-1 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#1A1217]"
                      >
                        <option value="member">Member</option>
                        <option value="head">Head</option>
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
                        className={`min-h-[36px] border px-3 py-1 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider transition ${
                          profile.active
                            ? 'border-[#2F6B34]/40 bg-[#EAF4EC] text-[#1F4A25] hover:border-[#2F6B34]'
                            : 'border-[#7C1E21]/40 bg-[#FBECEC] text-[#6E171B] hover:border-[#7C1E21]'
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
                        className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap border border-[#1A1217]/20 bg-[#EDE6D6] px-3 py-1 font-['Cinzel',serif] text-[11px] font-semibold uppercase tracking-wider text-[#1A1217] hover:border-[#1A1217]"
                      >
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Send Password Reset</span>
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
        title={
          pendingAction?.kind === 'role' ? 'Confirm Role Change' : 'Confirm Status Change'
        }
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
