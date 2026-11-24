import React, { useMemo, useState } from 'react';
import { Download, Edit3, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { recordAuditLog, supabase } from '../../lib/supabase';
import type { ProfileRow, RosterRow } from '../../types/database';
import {
  exportRosterToCsv,
  isValidEmailFormat,
  normalizeEmail,
  parseAndValidateRosterCsv,
  type CsvImportValidationRow
} from '../../utils/portalLogic';
import { ConfirmModal } from '../ConfirmModal';

interface RosterTabProps {
  roster: RosterRow[];
  profiles: ProfileRow[];
  loading: boolean;
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

export const RosterTab: React.FC<RosterTabProps> = ({
  roster,
  profiles,
  loading,
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

  const [deleteTarget, setDeleteTarget] = useState<RosterRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const linkedRosterIds = useMemo(
    () => new Set(profiles.map(p => p.roster_id).filter((id): id is string => Boolean(id))),
    [profiles]
  );

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of roster) {
      if (r.department.trim()) set.add(r.department.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [roster]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = roster.filter(row => {
      if (deptFilter !== 'ALL' && row.department.trim() !== deptFilter) return false;
      if (!q) return true;
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.phone.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q) ||
        row.position.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'department') {
        const d = a.department.localeCompare(b.department);
        return d !== 0 ? d : a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === 'status') {
        const sa = linkedRosterIds.has(a.id) ? 1 : 0;
        const sb = linkedRosterIds.has(b.id) ? 1 : 0;
        if (sa !== sb) return sb - sa;
      }
      return a.full_name.localeCompare(b.full_name);
    });
  }, [roster, searchQuery, deptFilter, sortBy, linkedRosterIds]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: RosterRow) => {
    setForm({
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      department: row.department,
      position: row.position || 'Member',
      notes: row.notes || ''
    });
    setFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

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
        const { error } = await supabase.from('roster').update(payload).eq('id', form.id);
        if (error) {
          onToast('error', error.message || 'Could not update roster entry.');
          return;
        }
        await recordAuditLog('roster.update', { email: cleanEmail, full_name: cleanName });
        onToast('success', `Updated ${cleanName} on the roster.`);
      } else {
        const { error } = await supabase.from('roster').insert(payload);
        if (error) {
          onToast('error', error.message || 'Could not add roster entry.');
          return;
        }
        await recordAuditLog('roster.create', { email: cleanEmail, full_name: cleanName });
        onToast('success', `Added ${cleanName} to the roster.`);
      }

      setFormOpen(false);
      await onRefresh();
    } finally {
      setSavingForm(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!supabase || !deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('roster').delete().eq('id', deleteTarget.id);
      if (error) {
        onToast('error', error.message || 'Failed to delete roster entry.');
        return;
      }
      await recordAuditLog('roster.delete', {
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
    if (!supabase || validCsvRows.length === 0) return;
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

      const { error } = await supabase.from('roster').insert(payload);
      if (error) {
        onToast('error', error.message || 'CSV import failed.');
        return;
      }
      await recordAuditLog('roster.csv_import', { imported_count: payload.length });
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
    const csv = exportRosterToCsv(filteredRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veritas-mun-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    void recordAuditLog('roster.csv_export', { exported_count: filteredRows.length });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-[#1A1217]/15 bg-[#FAF6EE] p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1A1217]/50" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search roster"
              placeholder="Search name, email, phone, position..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full min-h-[42px] border border-[#1A1217]/20 bg-[#EDE6D6]/50 pl-9 pr-3 py-1.5 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217] focus:border-[#2F6B34] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by department"
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="min-h-[42px] border border-[#1A1217]/20 bg-[#EDE6D6]/50 px-3 py-1.5 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]"
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
            className="min-h-[42px] border border-[#1A1217]/20 bg-[#EDE6D6]/50 px-3 py-1.5 font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]"
          >
            <option value="name">Sort: Name</option>
            <option value="department">Sort: Department</option>
            <option value="status">Sort: Sign-Up Status</option>
          </select>
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
            className="inline-flex min-h-[42px] items-center gap-1.5 whitespace-nowrap border border-[#1A1217]/25 bg-[#EDE6D6] px-3.5 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-wider uppercase text-[#1A1217] hover:border-[#1A1217]"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Import CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex min-h-[42px] items-center gap-1.5 whitespace-nowrap border border-[#1A1217]/25 bg-[#EDE6D6] px-3.5 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-wider uppercase text-[#1A1217] hover:border-[#1A1217] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={openAdd}
            className="inline-flex min-h-[42px] items-center gap-1.5 whitespace-nowrap bg-[#2F6B34] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold tracking-wider uppercase text-[#EDE6D6] hover:bg-[#1F4A25]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Add Person</span>
          </button>
        </div>
      </div>

      <div className="border border-[#1A1217]/15 bg-[#FAF6EE] overflow-x-auto">
        {loading ? (
          <p className="p-6 font-['Cormorant_Garamond',Georgia,serif] text-lg text-[#1A1217]/75">
            Loading roster...
          </p>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-['Cormorant_Garamond',Georgia,serif] text-xl italic text-[#1A1217]/75">
              {roster.length === 0
                ? 'Your roster is empty. Add your team members or import a CSV.'
                : 'No roster members match your current filter.'}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1A1217]/15 bg-[#EDE6D6]/60 font-['Cinzel',serif] text-[11px] font-semibold tracking-[0.08em] uppercase text-[#1A1217]/80">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1217]/10 font-['Cormorant_Garamond',Georgia,serif] text-base">
              {filteredRows.map(row => {
                const signedUp = linkedRosterIds.has(row.id);
                return (
                  <tr key={row.id} className="hover:bg-[#EDE6D6]/40">
                    <td className="px-4 py-3 font-semibold text-[#1A1217]">{row.full_name}</td>
                    <td className="px-4 py-3 text-[#1A1217]/85">{row.email}</td>
                    <td className="px-4 py-3 tabular-nums text-[#1A1217]/80">{row.phone || '—'}</td>
                    <td className="px-4 py-3 text-[#1A1217]/85">{row.department || '—'}</td>
                    <td className="px-4 py-3 text-[#1A1217]/85">{row.position || 'Member'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-['Cinzel',serif] text-[11px] font-semibold uppercase tracking-wider ${
                          signedUp ? 'text-[#2F6B34]' : 'text-[#7C5A1E]'
                        }`}
                      >
                        {signedUp ? 'Signed Up' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          aria-label={`Edit ${row.full_name}`}
                          className="p-2 text-[#1A1217]/70 hover:text-[#2F6B34]"
                        >
                          <Edit3 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          aria-label={`Delete ${row.full_name}`}
                          className="p-2 text-[#1A1217]/70 hover:text-[#7C1E21]"
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

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/75 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roster-form-title"
        >
          <div className="w-full max-w-lg border border-[#1A1217]/20 bg-[#EDE6D6] p-6 text-[#1A1217] shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1A1217]/15 pb-3">
              <h2 id="roster-form-title" className="font-['Cinzel',serif] text-lg font-semibold uppercase tracking-wide">
                {form.id ? 'Edit Roster Entry' : 'Add Team Member to Roster'}
              </h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close form" className="p-1.5 text-[#1A1217]/70 hover:text-[#1A1217]">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="mt-4 space-y-4">
              <div>
                <label htmlFor="r-name" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  id="r-name"
                  type="text"
                  required
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                />
              </div>

              <div>
                <label htmlFor="r-email" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Email *
                </label>
                <input
                  id="r-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="r-phone" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                    Phone
                  </label>
                  <input
                    id="r-phone"
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                  />
                </div>
                <div>
                  <label htmlFor="r-dept" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                    Department
                  </label>
                  <input
                    id="r-dept"
                    type="text"
                    value={form.department}
                    onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    placeholder="e.g. Crisis, Operations"
                    className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="r-pos" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Position
                </label>
                <input
                  id="r-pos"
                  type="text"
                  list="roster-position-list"
                  value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                  className="mt-1 w-full min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-1.5 text-base"
                />
                <datalist id="roster-position-list">
                  {POSITION_SUGGESTIONS.map(pos => (
                    <option key={pos} value={pos} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="r-notes" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Internal Notes
                </label>
                <textarea
                  id="r-notes"
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-2 text-base"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="min-h-[42px] bg-[#2F6B34] px-5 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#EDE6D6] hover:bg-[#1F4A25] disabled:opacity-60"
                >
                  {savingForm ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {csvModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1217]/75 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="csv-modal-title"
        >
          <div className="w-full max-w-3xl border border-[#1A1217]/20 bg-[#EDE6D6] p-6 text-[#1A1217] shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#1A1217]/15 pb-3">
              <h2 id="csv-modal-title" className="font-['Cinzel',serif] text-lg font-semibold uppercase tracking-wide">
                Import Roster CSV
              </h2>
              <button type="button" onClick={() => setCsvModalOpen(false)} aria-label="Close CSV importer" className="p-1.5 text-[#1A1217]/70 hover:text-[#1A1217]">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="font-['Cormorant_Garamond',Georgia,serif] text-base text-[#1A1217]/85">
                Columns required: <code className="font-mono text-xs">full_name, email</code> (optional: <code className="font-mono text-xs">phone, department, position, notes</code>). Preview validates duplicates and formatting before saving.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 border border-[#1A1217]/25 bg-[#FAF6EE] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider hover:border-[#1A1217]">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Choose CSV File</span>
                  <input type="file" accept=".csv,text/csv" onChange={handleCsvFileUpload} className="sr-only" />
                </label>
              </div>

              <div>
                <label htmlFor="csv-paste" className="block font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider">
                  Or paste CSV rows
                </label>
                <textarea
                  id="csv-paste"
                  rows={5}
                  value={csvText}
                  onChange={e => handleCsvInputChange(e.target.value)}
                  placeholder="full_name,email,phone,department,position"
                  className="mt-1 w-full border border-[#1A1217]/25 bg-[#FAF6EE] px-3 py-2 font-mono text-xs text-[#1A1217]"
                />
              </div>

              {csvHeaderError ? (
                <p className="border border-[#7C1E21]/40 bg-[#FBECEC] px-3 py-2 text-sm text-[#6E171B]" role="alert">
                  {csvHeaderError}
                </p>
              ) : null}

              {csvPreview.length > 0 ? (
                <div className="border border-[#1A1217]/15 bg-[#FAF6EE] max-h-60 overflow-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#1A1217]/15 bg-[#EDE6D6] font-['Cinzel',serif] text-[10px] uppercase">
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
                              <span className="font-semibold text-[#7C1E21]">{item.errors.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="font-['Cormorant_Garamond',Georgia,serif] text-base tabular-nums">
                  {validCsvRows.length} valid of {csvPreview.length} rows
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCsvModalOpen(false)}
                    className="min-h-[42px] border border-[#1A1217]/25 bg-[#FAF6EE] px-4 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={importingCsv || validCsvRows.length === 0}
                    onClick={handleImportValidCsv}
                    className="min-h-[42px] bg-[#2F6B34] px-5 py-2 font-['Cinzel',serif] text-xs font-semibold uppercase tracking-wider text-[#EDE6D6] hover:bg-[#1F4A25] disabled:opacity-50"
                  >
                    {importingCsv ? 'Importing...' : `Import ${validCsvRows.length} Valid Rows`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
