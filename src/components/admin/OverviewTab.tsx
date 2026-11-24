import React from 'react';
import { Clock, UserCheck, UserPlus, Users } from 'lucide-react';
import type { AuditLogRow, ProfileRow, RosterRow } from '../../types/database';
import { computeOverviewMetrics } from '../../utils/portalLogic';

interface OverviewTabProps {
  roster: RosterRow[];
  profiles: ProfileRow[];
  auditLogs: AuditLogRow[];
  loading: boolean;
  onJumpToTab: (tab: 'roster' | 'members' | 'audit') => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  roster,
  profiles,
  auditLogs,
  loading,
  onJumpToTab
}) => {
  const stats = computeOverviewMetrics(roster, profiles);
  const linkedIds = new Set(profiles.map(p => p.roster_id).filter((id): id is string => Boolean(id)));
  const pendingRoster = roster.filter(r => !linkedIds.has(r.id)).slice(0, 8);
  const recentLogs = auditLogs.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/70">
            <span className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase">
              Total Roster
            </span>
            <Users className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
          </div>
          <p className="mt-3 font-['Cinzel',serif] text-3xl font-semibold tabular-nums text-[#1A1217]">
            {loading ? '—' : stats.totalRoster}
          </p>
          <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/75">
            Invited team entries
          </p>
        </div>

        <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/70">
            <span className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase">
              Signed Up
            </span>
            <UserCheck className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
          </div>
          <p className="mt-3 font-['Cinzel',serif] text-3xl font-semibold tabular-nums text-[#2F6B34]">
            {loading ? '—' : stats.signedUpCount}
          </p>
          <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/75">
            {loading ? '' : `${stats.activeAccountsCount} active accounts`}
          </p>
        </div>

        <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/70">
            <span className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase">
              Pending Sign-Up
            </span>
            <UserPlus className="h-4 w-4 text-[#7C5A1E]" aria-hidden="true" />
          </div>
          <p className="mt-3 font-['Cinzel',serif] text-3xl font-semibold tabular-nums text-[#1A1217]">
            {loading ? '—' : stats.notSignedUpCount}
          </p>
          <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/75">
            Not yet registered
          </p>
        </div>

        <div className="border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/70">
            <span className="font-['Cinzel',serif] text-xs font-semibold tracking-[0.08em] uppercase">
              Recent Events
            </span>
            <Clock className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
          </div>
          <p className="mt-3 font-['Cinzel',serif] text-3xl font-semibold tabular-nums text-[#1A1217]">
            {loading ? '—' : auditLogs.length}
          </p>
          <p className="mt-1 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/75">
            Recorded audit entries
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5 border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between gap-3 border-b border-[#1A1217]/15 pb-3">
            <h2 className="font-['Cinzel',serif] text-sm font-semibold tracking-[0.08em] uppercase text-[#1A1217]">
              Awaiting Sign-Up
            </h2>
            <button
              type="button"
              onClick={() => onJumpToTab('roster')}
              className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#2F6B34] underline underline-offset-4 hover:text-[#1F4A25]"
            >
              Manage Roster
            </button>
          </div>

          {loading ? (
            <p className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/70">
              Loading roster...
            </p>
          ) : pendingRoster.length === 0 ? (
            <p className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg italic text-[#1A1217]/75">
              {roster.length === 0
                ? 'No people in the roster yet.'
                : 'Every person on the roster has signed up.'}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1A1217]/10">
              {pendingRoster.map(person => (
                <li key={person.id} className="py-2.5 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-['Cormorant_Garamond',Georgia,serif] text-lg font-semibold text-[#1A1217] truncate">
                      {person.full_name}
                    </p>
                    <p className="font-['Cormorant_Garamond',Georgia,serif] text-sm text-[#1A1217]/70 truncate">
                      {person.email}
                    </p>
                  </div>
                  <span className="shrink-0 font-['Cinzel',serif] text-[11px] uppercase tracking-wider text-[#1A1217]/75">
                    {person.position || 'Member'}
                    {person.department ? ` · ${person.department}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-7 border border-[#1A1217]/15 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between gap-3 border-b border-[#1A1217]/15 pb-3">
            <h2 className="font-['Cinzel',serif] text-sm font-semibold tracking-[0.08em] uppercase text-[#1A1217]">
              Recent Admin Activity
            </h2>
            <button
              type="button"
              onClick={() => onJumpToTab('audit')}
              className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#2F6B34] underline underline-offset-4 hover:text-[#1F4A25]"
            >
              Full Audit Log
            </button>
          </div>

          {loading ? (
            <p className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/70">
              Loading activity...
            </p>
          ) : recentLogs.length === 0 ? (
            <p className="mt-4 font-['Cormorant_Garamond',Georgia,serif] text-lg italic text-[#1A1217]/75">
              No administrative actions recorded yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#1A1217]/10">
              {recentLogs.map(entry => (
                <li key={entry.id} className="py-2.5 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-['Cinzel',serif] text-xs font-semibold tracking-wider uppercase text-[#2F6B34]">
                      {entry.action}
                    </span>
                    <span className="mx-2 text-[#1A1217]/40">&middot;</span>
                    <span className="font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]">
                      {entry.user_email || 'Admin'}
                    </span>
                  </div>
                  <time
                    dateTime={entry.created_at}
                    className="font-['Cormorant_Garamond',Georgia,serif] text-sm tabular-nums text-[#1A1217]/65"
                  >
                    {new Date(entry.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
