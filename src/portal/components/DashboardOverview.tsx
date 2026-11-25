import React from 'react';
import {
  ArrowRight,
  Clock,
  FileCheck2,
  Globe,
  Megaphone,
  ShieldCheck,
  UserPlus,
  Users
} from 'lucide-react';
import {
  computeApplicationMetrics,
  formatDateTime,
  formatShortDate,
  type AdminSectionId
} from '../../utils/portalAdminLogic';
import { computeOverviewMetrics } from '../../utils/portalLogic';
import type {
  PortalApplication,
  PortalAuditEntry,
  PortalProfile,
  PortalRosterEntry
} from '../supabaseClient';

interface DashboardOverviewProps {
  me: PortalProfile;
  applications: PortalApplication[];
  roster: PortalRosterEntry[];
  profiles: PortalProfile[];
  auditLogs: PortalAuditEntry[];
  loading: boolean;
  onNavigate: (section: AdminSectionId, applicationId?: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  me,
  applications,
  roster,
  profiles,
  auditLogs,
  loading,
  onNavigate
}) => {
  const firstName = (me.full_name || '').trim().split(/\s+/)[0] || 'Administrator';
  const appStats = computeApplicationMetrics(applications);
  const rosterStats = computeOverviewMetrics(roster as never, profiles as never);

  const linkedIds = new Set(
    profiles.map(p => p.roster_id).filter((id): id is string => Boolean(id))
  );
  const awaitingRoster = roster.filter(r => !linkedIds.has(r.id)).slice(0, 6);
  const recentApps = applications.slice(0, 6);
  const recentLogs = auditLogs.slice(0, 6);

  return (
    <div className="space-y-6 v-animate-in">
      {/* Personalized executive header */}
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1A1217]/14 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2F6B34]">
            Executive Board Overview
          </p>
          <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-[#1A1217]">
            Welcome back, {firstName}
          </h2>
          <p className="mt-1 font-editorial text-lg text-[#1A1217]/75">
            {me.position || 'Executive Board'}
            {me.department ? ` · ${me.department} Department` : ''} — Live conference operations and application review queue.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('security_applications')}
            className="v-btn v-btn-primary"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Review Security Queue</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('roster')}
            className="v-btn v-btn-secondary"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>Manage Roster</span>
          </button>
        </div>
      </section>

      {/* 4 KPI cards (single-elevation, 1px hairline border, tabular-nums) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        <div className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/65">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Applications</span>
            <Clock className="h-4 w-4 text-[#8C5A16]" aria-hidden="true" />
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-[#1A1217]">
            {loading ? '—' : appStats.pending}
          </p>
          <p className="mt-1 text-xs text-[#1A1217]/65 tabular-nums">
            {loading
              ? 'Loading queue...'
              : `${appStats.securityCount} Security · ${appStats.volunteerCount} Volunteers`}
          </p>
        </div>

        <div className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/65">
            <span className="text-xs font-semibold uppercase tracking-wider">Awaiting Final Decision</span>
            <FileCheck2 className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-[#2F6B34]">
            {loading ? '—' : appStats.recommendedAwaitingDecision}
          </p>
          <p className="mt-1 text-xs text-[#1A1217]/65 tabular-nums">
            {loading ? '' : `${appStats.accepted} accepted · ${appStats.rejected} rejected`}
          </p>
        </div>

        <div className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/65">
            <span className="text-xs font-semibold uppercase tracking-wider">Team Roster</span>
            <Users className="h-4 w-4 text-[#1A1217]/70" aria-hidden="true" />
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-[#1A1217]">
            {loading ? '—' : rosterStats.totalRoster}
          </p>
          <p className="mt-1 text-xs text-[#1A1217]/65 tabular-nums">
            {loading
              ? ''
              : `${rosterStats.signedUpCount} signed up · ${rosterStats.notSignedUpCount} awaiting`}
          </p>
        </div>

        <div className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
          <div className="flex items-center justify-between text-[#1A1217]/65">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Accounts</span>
            <UserPlus className="h-4 w-4 text-[#2F6B34]" aria-hidden="true" />
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-[#1A1217]">
            {loading ? '—' : rosterStats.activeAccountsCount}
          </p>
          <p className="mt-1 text-xs text-[#1A1217]/65 tabular-nums">
            {loading ? '' : `${profiles.length} total registered accounts`}
          </p>
        </div>
      </section>

      {/* Main 2-column workspace grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Recent Applications */}
        <section className="lg:col-span-7 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE]">
          <div className="flex items-center justify-between gap-3 border-b border-[#1A1217]/12 px-5 py-4">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
                Recent Applications
              </h3>
              <p className="mt-0.5 text-xs text-[#1A1217]/60">
                Latest submissions awaiting Security Head or Executive Board review
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('all_applications')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F6B34] hover:underline whitespace-nowrap"
            >
              <span>View all</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-10 w-full animate-pulse rounded-[2px] bg-[#EDE6D6]" />
              ))}
            </div>
          ) : recentApps.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-editorial text-lg italic text-[#1A1217]/70">
                No applications have been submitted yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#1A1217]/12 bg-[#F4EFE4] text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/65">
                    <th className="px-4 py-2.5">Applicant</th>
                    <th className="px-4 py-2.5">Track</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Submitted</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1217]/10 text-sm">
                  {recentApps.map(app => (
                    <tr key={app.id} className="hover:bg-[#EDE6D6]/45 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#1A1217]">{app.full_name}</p>
                        <p className="text-xs text-[#1A1217]/65 truncate max-w-[200px]">
                          {app.school || app.email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-[#1A1217]/80">
                        {app.track || 'Security'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`v-status ${
                              app.status === 'accepted'
                                ? 'v-status-accepted'
                                : app.status === 'rejected'
                                  ? 'v-status-rejected'
                                  : 'v-status-pending'
                            }`}
                          >
                            {app.status}
                          </span>
                          {app.recommendation && (
                            <span className="text-[11px] font-medium text-[#1A1217]/65">
                              Head: {app.recommendation}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-[#1A1217]/70 whitespace-nowrap">
                        {formatShortDate(app.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate(
                              (app.track || '').toLowerCase() === 'volunteers'
                                ? 'volunteer_applications'
                                : 'security_applications',
                              app.id
                            )
                          }
                          className="v-btn v-btn-secondary min-h-[32px] px-2.5 py-1 text-xs"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right column: Quick Actions + Awaiting Sign-up + Recent Activity */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
            <h3 className="border-b border-[#1A1217]/12 pb-3 font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
              Quick Actions
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onNavigate('security_applications')}
                className="flex items-center gap-2.5 rounded-[2px] border border-[#1A1217]/14 bg-[#EDE6D6]/45 px-3 py-2.5 text-left text-xs font-semibold text-[#1A1217] hover:border-[#2F6B34] hover:bg-[#FAF6EE]"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#2F6B34]" aria-hidden="true" />
                <span>Security Queue</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('announcements')}
                className="flex items-center gap-2.5 rounded-[2px] border border-[#1A1217]/14 bg-[#EDE6D6]/45 px-3 py-2.5 text-left text-xs font-semibold text-[#1A1217] hover:border-[#2F6B34] hover:bg-[#FAF6EE]"
              >
                <Megaphone className="h-4 w-4 shrink-0 text-[#2F6B34]" aria-hidden="true" />
                <span>Post Announcement</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('roster')}
                className="flex items-center gap-2.5 rounded-[2px] border border-[#1A1217]/14 bg-[#EDE6D6]/45 px-3 py-2.5 text-left text-xs font-semibold text-[#1A1217] hover:border-[#2F6B34] hover:bg-[#FAF6EE]"
              >
                <Users className="h-4 w-4 shrink-0 text-[#2F6B34]" aria-hidden="true" />
                <span>Edit Team Roster</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('content')}
                className="flex items-center gap-2.5 rounded-[2px] border border-[#1A1217]/14 bg-[#EDE6D6]/45 px-3 py-2.5 text-left text-xs font-semibold text-[#1A1217] hover:border-[#2F6B34] hover:bg-[#FAF6EE]"
              >
                <Globe className="h-4 w-4 shrink-0 text-[#2F6B34]" aria-hidden="true" />
                <span>Website Content</span>
              </button>
            </div>
          </section>

          <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
            <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
                Awaiting Roster Sign-Up
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('roster')}
                className="text-xs font-semibold text-[#2F6B34] hover:underline"
              >
                Roster
              </button>
            </div>

            {loading ? (
              <p className="mt-3 text-xs text-[#1A1217]/65">Loading roster status...</p>
            ) : awaitingRoster.length === 0 ? (
              <p className="mt-3 text-sm text-[#1A1217]/70">
                {roster.length === 0
                  ? 'No roster entries created yet.'
                  : 'All roster members have registered.'}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[#1A1217]/10">
                {awaitingRoster.map(person => (
                  <li key={person.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#1A1217]">{person.full_name}</p>
                      <p className="truncate text-xs text-[#1A1217]/60">{person.email}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-[#1A1217]/75">
                      {person.position || 'Member'}
                      {person.department ? ` · ${person.department}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-5">
            <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[#1A1217]">
                Recent Activity
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="text-xs font-semibold text-[#2F6B34] hover:underline"
              >
                Full Log
              </button>
            </div>

            {loading ? (
              <p className="mt-3 text-xs text-[#1A1217]/65">Loading activity...</p>
            ) : recentLogs.length === 0 ? (
              <p className="mt-3 text-sm text-[#1A1217]/70">No administrative actions logged yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#1A1217]/10">
                {recentLogs.map(entry => (
                  <li key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-[#2F6B34]">{entry.action}</span>
                      <time dateTime={entry.created_at} className="text-[11px] tabular-nums text-[#1A1217]/55">
                        {formatDateTime(entry.created_at)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-xs text-[#1A1217]/70 truncate">
                      {entry.user_email || 'Administrator'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
