import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { AuditLogRow } from '../../types/database';

interface AuditLogTabProps {
  logs: AuditLogRow[];
  loading: boolean;
}

export const AuditLogTab: React.FC<AuditLogTabProps> = ({ logs, loading }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(entry => {
      const detailsStr = JSON.stringify(entry.details || {}).toLowerCase();
      return (
        entry.action.toLowerCase().includes(q) ||
        (entry.user_email || '').toLowerCase().includes(q) ||
        detailsStr.includes(q)
      );
    });
  }, [logs, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#1A1217]/15 bg-[#FAF6EE] p-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/50" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search audit log"
            placeholder="Search action, actor email, or details..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full min-h-[42px] border border-[#1A1217]/20 bg-[#EDE6D6]/50 pl-9 pr-3 py-1.5 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217] focus:border-[#2F6B34] focus:outline-none"
          />
        </div>
        <span className="font-['Cormorant_Garamond',Georgia,serif] text-base tabular-nums text-[#1A1217]/75">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="border border-[#1A1217]/15 bg-[#FAF6EE] overflow-x-auto">
        {loading ? (
          <p className="p-6 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/75">
            Loading audit trail...
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center font-['Cormorant_Garamond',Georgia,serif] text-xl italic text-[#1A1217]/75">
            No audit log entries match your filter.
          </p>
        ) : (
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1A1217]/15 bg-[#EDE6D6]/60 font-['Cinzel',serif] text-[11px] font-semibold tracking-[0.08em] uppercase text-[#1A1217]/80">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1217]/10 font-['Cormorant_Garamond',Georgia,serif] text-base">
              {filtered.map(entry => (
                <tr key={entry.id} className="align-top hover:bg-[#EDE6D6]/40">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-[#1A1217]/75">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[#1A1217]">{entry.user_email || 'System'}</td>
                  <td className="px-4 py-3">
                    <span className="font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#2F6B34]">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#1A1217]/80 break-all">
                    {JSON.stringify(entry.details || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
