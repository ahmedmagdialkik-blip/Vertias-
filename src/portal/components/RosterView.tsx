import React, { useMemo, useState } from 'react';
import { Download, Edit3, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import {
  exportRosterToCsv,
  isValidEmailFormat,
  normalizeEmail,
  parseAndValidateRosterCsv,
  type CsvImportValidationRow
} from '../../utils/portalLogic';
import {
  recordPortalAuditLog,
  sb,
  type PortalProfile,
  type PortalRosterEntry
} from '../supabaseClient';
import { ConfirmModal } from './ConfirmModal';

interface RosterViewProps {
  me: PortalProfile;
  roster: PortalRosterEntry[];
  profiles: PortalProfile[];
  loading: boolean;
  globalSearch?: string;
  onRefresh: () => Promise<void>;
  onToast: (kind: 'success' | 'error', text: string) => void;
}

const POSITION_SUGGESTIONS = ['SG', 'DSG', 'USG', 'Head', 'Co-head', 'Member'];

interface RosterFormState {
  id: string | null;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  notes: string;
}

const EMPTY_FORM: RosterFormState = {
  id: null,
  full_name: '',
  email: '',
  phone: '',
  department: '',
  position: 'Member',
  notes: ''
};

export const RosterView: React.FC<RosterViewProps> = ({
  me,
  roster,
  profiles,
  loading,
  globalSearch = '',
  onRefresh,
  onToast
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'department' | 'status'>('name');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RosterFormState>(EMPTY_FORM);
  const [savingForm, setSavingForm] = useState(false);

  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvImportValidationRow[]>([]);
  const [csvHeaderError, setCsvHeaderError] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PortalRosterEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const linkedRosterIds = useMemo(
    () => new Set(profiles.map(p => p.roster_id).filter((id): id is string => Boolean(id))),
    [profiles]
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of roster) {
      if ((r.department || '').trim()) set.add(r.department.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [roster]);

  const effectiveQuery = (searchQuery || globalSearch).trim().toLowerCase();

  const filteredRows = useMemo(() => {
    const filtered = roster.filter(row => {
      if (deptFilter !== 'ALL' && (row.department || '').trim() !== deptFilter) return false;
      if (!effectiveQuery) return true;
      return (
        (row.full_name || '').toLowerCase().includes(effectiveQuery) ||
        (row.email || '').toLowerCase().includes(effectiveQuery) ||
        (row.phone || '').toLowerCase().includes(effectiveQuery) ||
        (row.department || '').toLowerCase().includes(effectiveQuery) ||
        (row.position || '').toLowerCase().includes(effectiveQuery)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'department') {
        const d = (a.department || '').localeCompare(b.department || '');
        return d !== 0 ? d : a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === 'status') {
        const sa = linkedRosterIds.has(a.id) ? 1 : 0;
        const sbFlag = linkedRosterIds.has(b.id) ? 1 : 0;
        if (sa !== sbFlag) return sbFlag - sa;
      }
      return a.full_name.localeCompare(b.full_name);
    });
  }, [roster, deptFilter, effectiveQuery, sortBy, linkedRosterIds]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: PortalRosterEntry) => {
    setForm({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone || '',
      department: row.department || '',
      position: row.position || 'Member',
      notes: row.notes || ''
    });
    setFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = form.full_name.trim();
    const cleanEmail = normalizeEmail(form.email);
    if (!cleanName) {
      onToast('error', 'Full name is required.');
      return;
    }
    if (!isValidEmailFormat(cleanEmail)) {
      onToast('error', 'Enter a valid email address.');
      return;
    }

    setSavingForm(true);
    try {
      const payload = {
        full_name: cleanName,
        email: cleanEmail,
        phone: form.phone.trim(),
        department: form.department.trim(),
        position: form.position.trim() || 'Member',
        notes: form.notes.trim()
      };

      if (form.id) {
        const { error } = await sb.from('roster').update(payload).eq('id', form.id);
        if (error) {
          onToast('error', error.message || 'Could not update roster entry.');
          return;
        }
        await recordPortalAuditLog(me.id, me.email, 'roster.update', {
          email: cleanEmail,
          full_name: cleanName
        });
        onToast('success', `Updated ${cleanName} on the roster.`);
      } else {
        const { error } = await sb.from('roster').insert(payload);
        if (error) {
          onToast('error', error.message || 'Could not add roster entry.');
          return;
        }
        await recordPortalAuditLog(me.id, me.email, 'roster.create', {
          email: cleanEmail,
          full_name: cleanName
        });
        onToast('success', `Added ${cleanName} to the roster.`);
      }

      setFormOpen(false);
      await onRefresh();
    } finally {
      setSavingForm(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await sb.from('roster').delete().eq('id', deleteTarget.id);
      if (error) {
        onToast('error', error.message || 'Failed to delete roster entry.');
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'roster.delete', {
        id: deleteTarget.id,
        email: deleteTarget.email,
        full_name: deleteTarget.full_name
      });
      onToast('success', `Removed ${deleteTarget.full_name} from the roster.`);
      setDeleteTarget(null);
      await onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  const handleCsvInputChange = (nextText: string) => {
    setCsvText(nextText);
    if (!nextText.trim()) {
      setCsvPreview([]);
      setCsvHeaderError(null);
      return;
    }
    const { rows, headerError } = parseAndValidateRosterCsv(
      nextText,
      roster.map(r => r.email)
    );
    setCsvHeaderError(headerError);
    setCsvPreview(rows);
  };

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    handleCsvInputChange(text);
  };

  const validCsvRows = csvPreview.filter(r => r.valid);

  const handleImportValidCsv = async () => {
    if (validCsvRows.length === 0) return;
    setImportingCsv(true);
    try {
      const payload = validCsvRows.map(r => ({
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        department: r.department,
        position: r.position || 'Member',
        notes: r.notes || ''
      }));

      const { error } = await sb.from('roster').insert(payload);
      if (error) {
        onToast('error', error.message || 'CSV import failed.');
        return;
      }
      await recordPortalAuditLog(me.id, me.email, 'roster.csv_import', {
        imported_count: payload.length
      });
      onToast('success', `Imported ${payload.length} roster entries.`);
      setCsvModalOpen(false);
      setCsvText('');
      setCsvPreview([]);
      await onRefresh();
    } finally {
      setImportingCsv(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportRosterToCsv(filteredRows as never);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veritas-mun-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void recordPortalAuditLog(me.id, me.email, 'roster.csv_export', {
      exported_count: filteredRows.length
    });
  };

  return (
    <div className="space-y-5 v-animate-in">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1A1217]/14 pb-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#1A1217]">Team &amp; Roster</h2>
          <p className="mt-1 max-w-2xl text-sm text-[#1A1217]/70">
            Only emails on this roster can sign up for portal accounts. Roles auto-assign from position (e.g., Head / Co-head) and can be refined under Accounts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCsvModalOpen(true);
              setCsvText('');
              setCsvPreview([]);
              setCsvHeaderError(null);
            }}
            className="v-btn v-btn-secondary"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Import CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="v-btn v-btn-secondary"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button type="button" onClick={openAdd} className="v-btn v-btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Person</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE] p-3.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/45" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search roster"
            placeholder="Search name, email, phone, position..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="v-input pl-9"
          />
        </div>

        <select
          aria-label="Filter by department"
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="v-input w-auto min-w-[160px]"
        >
          <option value="ALL">All Departments</option>
          {departments.map(dep => (
            <option key={dep} value={dep}>
              {dep}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort roster"
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'name' | 'department' | 'status')}
          className="v-input w-auto min-w-[165px]"
        >
          <option value="name">Sort: Name</option>
          <option value="department">Sort: Department</option>
          <option value="status">Sort: Sign-Up Status</option>
        </select>

        <span className="ml-auto text-xs font-medium tabular-nums text-[#1A1217]/65">
          {filteredRows.length} {filteredRows.length === 1 ? 'member' : 'members'}
        </span>
      </div>

      {/* Roster Table */}
      <div className="overflow-x-auto rounded-[2px] border border-[#1A1217]/14 bg-[#FAF6EE]">
        {loading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-10 w-full animate-pulse rounded-[2px] bg-[#EDE6D6]" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-editorial text-xl italic text-[#1A1217]/75">
              {roster.length === 0
                ? 'Your roster is empty. Add team members or import a CSV.'
                : 'No roster members match your current filter.'}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1A1217]/12 bg-[#F4EFE4] text-[11px] font-semibold uppercase tracking-wider text-[#1A1217]/70">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1217]/10 text-sm">
              {filteredRows.map(row => {
                const signedUp = linkedRosterIds.has(row.id);
                return (
                  <tr key={row.id} className="hover:bg-[#EDE6D6]/45 transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#1A1217]">{row.full_name}</td>
                    <td className="px-4 py-3 text-[#1A1217]/80">{row.email}</td>
                    <td className="px-4 py-3 tabular-nums text-[#1A1217]/75">{row.phone || '—'}</td>
                    <td className="px-4 py-3 text-[#1A1217]/85">{row.department || '—'}</td>
                    <td className="px-4 py-3 text-[#1A1217]/85">{row.position || 'Member'}</td>
                    <td className="px-4 py-3">
                      <span className={`v-status ${signedUp ? 'v-status-accepted' : 'v-status-pending'}`}>
                        {signedUp ? 'Signed Up' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          aria-label={`Edit ${row.full_name}`}
                          className="rounded-[2px] p-2 text-[#1A1217]/70 hover:bg-[#EDE6D6] hover:text-[#2F6B34]"
                        >
                          <Edit3 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          aria-label={`Delete ${row.full_name}`}
                          className="rounded-[2px] p-2 text-[#1A1217]/70 hover:bg-[#EDE6D6] hover:text-[#8A2B2B]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/70 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roster-form-title"
        >
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[2px] border border-[#1A1217]/20 bg-[#FAF6EE] p-6 text-[#1A1217] shadow-2xl v-animate-in">
            <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3.5">
              <h3 id="roster-form-title" className="font-display text-base font-semibold uppercase tracking-wide">
                {form.id ? 'Edit Roster Entry' : 'Add Team Member'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close form"
                className="p-1 text-[#1A1217]/60 hover:text-[#1A1217]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="mt-4 space-y-4">
              <div>
                <label htmlFor="r-name" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  id="r-name"
                  type="text"
                  required
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="v-input"
                />
              </div>

              <div>
                <label htmlFor="r-email" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Email *
                </label>
                <input
                  id="r-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="v-input"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="r-phone" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                    Phone
                  </label>
                  <input
                    id="r-phone"
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="v-input tabular-nums"
                  />
                </div>
                <div>
                  <label htmlFor="r-dept" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                    Department
                  </label>
                  <input
                    id="r-dept"
                    type="text"
                    value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    placeholder="e.g. Security, Volunteers"
                    className="v-input"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="r-pos" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Position
                </label>
                <input
                  id="r-pos"
                  type="text"
                  list="roster-position-list"
                  value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  className="v-input"
                />
                <datalist id="roster-position-list">
                  {POSITION_SUGGESTIONS.map(pos => (
                    <option key={pos} value={pos} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="r-notes" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Internal Notes
                </label>
                <textarea
                  id="r-notes"
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="v-input min-h-[72px]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="v-btn v-btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={savingForm} className="v-btn v-btn-primary">
                  {savingForm ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {csvModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/70 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="csv-modal-title"
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2px] border border-[#1A1217]/20 bg-[#FAF6EE] p-6 text-[#1A1217] shadow-2xl v-animate-in">
            <div className="flex items-center justify-between border-b border-[#1A1217]/12 pb-3.5">
              <h3 id="csv-modal-title" className="font-display text-base font-semibold uppercase tracking-wide">
                Import Roster CSV
              </h3>
              <button
                type="button"
                onClick={() => setCsvModalOpen(false)}
                aria-label="Close CSV importer"
                className="p-1 text-[#1A1217]/60 hover:text-[#1A1217]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-[#1A1217]/75">
                Required columns: <code className="font-mono">full_name, email</code> (optional:{' '}
                <code className="font-mono">phone, department, position, notes</code>). Duplicates and invalid emails are highlighted before import.
              </p>

              <label className="v-btn v-btn-secondary cursor-pointer">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Choose CSV File</span>
                <input type="file" accept=".csv,text/csv" onChange={handleCsvFileUpload} className="sr-only" />
              </label>

              <div>
                <label htmlFor="csv-paste" className="mb-1 block text-xs font-semibold uppercase tracking-wider">
                  Or paste CSV rows
                </label>
                <textarea
                  id="csv-paste"
                  rows={5}
                  value={csvText}
                  onChange={e => handleCsvInputChange(e.target.value)}
                  placeholder="full_name,email,phone,department,position"
                  className="v-input font-mono text-xs min-h-[110px]"
                />
              </div>

              {csvHeaderError && (
                <p role="alert" className="rounded-[2px] border border-[#8A2B2B]/40 bg-[#8A2B2B]/5 px-3 py-2 text-xs font-medium text-[#741F1F]">
                  {csvHeaderError}
                </p>
              )}

              {csvPreview.length > 0 && (
                <div className="max-h-60 overflow-auto rounded-[2px] border border-[#1A1217]/14 bg-[#EDE6D6]/35">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1A1217]/12 bg-[#F4EFE4] font-semibold uppercase">
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Dept / Position</th>
                        <th className="px-3 py-2">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1A1217]/10">
                      {csvPreview.map(item => (
                        <tr key={`${item.lineNumber}-${item.email}`}>
                          <td className="px-3 py-2 tabular-nums">{item.lineNumber}</td>
                          <td className="px-3 py-2">{item.full_name || '—'}</td>
                          <td className="px-3 py-2">{item.email || '—'}</td>
                          <td className="px-3 py-2">
                            {item.department || '—'} / {item.position}
                          </td>
                          <td className="px-3 py-2">
                            {item.valid ? (
                              <span className="font-semibold text-[#2F6B34]">Ready</span>
                            ) : (
                              <span className="font-semibold text-[#8A2B2B]">{item.errors.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs font-medium tabular-nums text-[#1A1217]/75">
                  {validCsvRows.length} valid of {csvPreview.length} rows
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setCsvModalOpen(false)} className="v-btn v-btn-secondary">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={importingCsv || validCsvRows.length === 0}
                    onClick={handleImportValidCsv}
                    className="v-btn v-btn-primary"
                  >
                    {importingCsv ? 'Importing...' : `Import ${validCsvRows.length} Valid Rows`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove Roster Member"
        description={
          deleteTarget
            ? `Remove ${deleteTarget.full_name} (${deleteTarget.email}) from the roster? Any linked account will lose its roster reference.`
            : ''
        }
        confirmLabel="Remove"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
