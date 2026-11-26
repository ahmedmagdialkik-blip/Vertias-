import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Layers, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import {
  INITIAL_EB_STRUCTURE,
  changeEbMemberDepartment,
  groupEbByDepartment,
  moveEbDepartmentOrder,
  moveEbMemberOrderInDepartment,
  normalizeEbDepartmentRows,
  normalizeEbMemberRows,
  validateEbDepartmentInput,
  validateEbMemberInput,
  type EbDepartmentRecord,
  type EbMemberRecord
} from '../../utils/executiveBoardLogic';

interface ExecutiveBoardManagementViewProps {
  sb: any;
  log: (action: string, details?: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface MemberDraft {
  id: string | null;
  full_name: string;
  role: string;
  department_id: string;
}

interface DepartmentDraft {
  id: string | null;
  name: string;
}

const EMPTY_MEMBER_DRAFT: MemberDraft = {
  id: null,
  full_name: '',
  role: '',
  department_id: ''
};

const EMPTY_DEPARTMENT_DRAFT: DepartmentDraft = {
  id: null,
  name: ''
};

export const ExecutiveBoardManagementView: React.FC<ExecutiveBoardManagementViewProps> = ({
  sb,
  log
}) => {
  const [departments, setDepartments] = useState<EbDepartmentRecord[]>([]);
  const [members, setMembers] = useState<EbMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deptFilter, setDeptFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [memberDraft, setMemberDraft] = useState<MemberDraft>(EMPTY_MEMBER_DRAFT);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<EbMemberRecord | null>(null);

  const [deptManagerOpen, setDeptManagerOpen] = useState(false);
  const [deptFormOpen, setDeptFormOpen] = useState(false);
  const [deptDraft, setDeptDraft] = useState<DepartmentDraft>(EMPTY_DEPARTMENT_DRAFT);

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [migrationMissing, setMigrationMissing] = useState(false);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setErr('');
    setMigrationMissing(false);
    try {
      const [deptRes, memberRes] = await Promise.all([
        sb
          .from('eb_departments')
          .select('id, name, sort_order, created_at, updated_at')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        sb
          .from('eb_members')
          .select('id, department_id, full_name, role, sort_order, created_at, updated_at')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
      ]);

      const firstErr = deptRes.error || memberRes.error;
      if (firstErr) {
        const msgText = String(firstErr.message || '');
        if (/eb_departments|eb_members|does not exist|PGRST205|schema cache/i.test(msgText)) {
          setMigrationMissing(true);
          setErr('Executive Board database tables are not created yet. Run supabase/migrations/007_executive_board.sql in Supabase SQL Editor.');
        } else {
          setErr(msgText || 'Could not load Executive Board directory.');
        }
        setDepartments([]);
        setMembers([]);
      } else {
        setDepartments(normalizeEbDepartmentRows(deptRes.data));
        setMembers(normalizeEbMemberRows(memberRes.data));
      }
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const groups = useMemo(
    () => groupEbByDepartment(departments, members, { includeEmpty: true }),
    [departments, members]
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .filter((group) => deptFilter === 'ALL' || group.department.id === deptFilter)
      .map((group) => {
        if (!q) return group;
        const deptMatch = group.department.name.toLowerCase().includes(q);
        const matchingMembers = deptMatch
          ? group.members
          : group.members.filter(
              (m) =>
                m.full_name.toLowerCase().includes(q) ||
                m.role.toLowerCase().includes(q)
            );
        return {
          department: group.department,
          members: matchingMembers
        };
      })
      .filter((group) => !q || group.members.length > 0 || group.department.name.toLowerCase().includes(q));
  }, [groups, deptFilter, search]);

  const deptNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) map.set(d.id, d.name);
    return map;
  }, [departments]);

  const openCreateMember = (presetDeptId?: string) => {
    setErr('');
    setMsg('');
    setDeleteMemberTarget(null);
    setMemberDraft({
      id: null,
      full_name: '',
      role: '',
      department_id: presetDeptId || departments[0]?.id || ''
    });
    setMemberFormOpen(true);
  };

  const openEditMember = (member: EbMemberRecord) => {
    setErr('');
    setMsg('');
    setDeleteMemberTarget(null);
    setMemberDraft({
      id: member.id,
      full_name: member.full_name,
      role: member.role,
      department_id: member.department_id
    });
    setMemberFormOpen(true);
  };

  const closeMemberForm = () => {
    setMemberFormOpen(false);
    setMemberDraft(EMPTY_MEMBER_DRAFT);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    const issue = validateEbMemberInput(memberDraft);
    if (issue) {
      setErr(issue);
      return;
    }

    setSaving(true);
    const fullName = memberDraft.full_name.trim();
    const role = memberDraft.role.trim();
    const targetDeptId = memberDraft.department_id;

    try {
      if (memberDraft.id) {
        const existing = members.find((m) => m.id === memberDraft.id);
        const deptChanged = existing && existing.department_id !== targetDeptId;

        if (deptChanged && existing) {
          const nextMembers = changeEbMemberDepartment(members, existing.id, targetDeptId).map((m) =>
            m.id === existing.id ? { ...m, full_name: fullName, role } : m
          );
          const changedRows = nextMembers.filter((m) => {
            const prev = members.find((p) => p.id === m.id);
            return (
              !prev ||
              prev.department_id !== m.department_id ||
              prev.sort_order !== m.sort_order ||
              prev.full_name !== m.full_name ||
              prev.role !== m.role
            );
          });

          for (const row of changedRows) {
            const { error } = await sb
              .from('eb_members')
              .update({
                full_name: row.full_name,
                role: row.role,
                department_id: row.department_id,
                sort_order: row.sort_order
              })
              .eq('id', row.id);
            if (error) {
              setErr(error.message || 'Could not update member department.');
              return;
            }
          }
          await log('eb.member.update', {
            id: existing.id,
            full_name: fullName,
            role,
            department: deptNameById.get(targetDeptId) || targetDeptId
          });
        } else {
          const { error } = await sb
            .from('eb_members')
            .update({ full_name: fullName, role })
            .eq('id', memberDraft.id);
          if (error) {
            setErr(error.message || 'Could not update member.');
            return;
          }
          await log('eb.member.update', {
            id: memberDraft.id,
            full_name: fullName,
            role,
            department: deptNameById.get(targetDeptId) || targetDeptId
          });
        }
        setMsg(`Updated "${fullName}".`);
      } else {
        const inDept = members.filter((m) => m.department_id === targetDeptId);
        const nextSort = inDept.reduce((max, m) => Math.max(max, Number(m.sort_order) || 0), -1) + 1;
        const { error } = await sb.from('eb_members').insert({
          full_name: fullName,
          role,
          department_id: targetDeptId,
          sort_order: nextSort
        });
        if (error) {
          setErr(error.message || 'Could not add member.');
          return;
        }
        await log('eb.member.create', {
          full_name: fullName,
          role,
          department: deptNameById.get(targetDeptId) || targetDeptId
        });
        setMsg(`Added "${fullName}" to ${deptNameById.get(targetDeptId) || 'department'}.`);
      }

      closeMemberForm();
      await loadBoard();
    } finally {
      setSaving(false);
    }
  };

  const handleMoveMember = async (member: EbMemberRecord, direction: 'up' | 'down') => {
    setErr('');
    setMsg('');
    const nextMembers = moveEbMemberOrderInDepartment(members, member.id, direction);
    const affected = nextMembers.filter((m) => m.department_id === member.department_id);
    setMembers(nextMembers);

    setSaving(true);
    try {
      for (const row of affected) {
        const { error } = await sb
          .from('eb_members')
          .update({ sort_order: row.sort_order })
          .eq('id', row.id);
        if (error) {
          setErr(error.message || 'Could not save member order.');
          await loadBoard();
          return;
        }
      }
      await log('eb.member.reorder', {
        id: member.id,
        full_name: member.full_name,
        department: deptNameById.get(member.department_id) || member.department_id,
        direction
      });
      setMsg(`Updated order for "${member.full_name}".`);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteMember = async () => {
    if (!deleteMemberTarget) return;
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      const { error } = await sb.from('eb_members').delete().eq('id', deleteMemberTarget.id);
      if (error) {
        setErr(error.message || 'Could not delete member.');
        return;
      }
      await log('eb.member.delete', {
        id: deleteMemberTarget.id,
        full_name: deleteMemberTarget.full_name,
        department: deptNameById.get(deleteMemberTarget.department_id) || deleteMemberTarget.department_id
      });
      setMsg(`Removed "${deleteMemberTarget.full_name}" from Executive Board.`);
      setDeleteMemberTarget(null);
      await loadBoard();
    } finally {
      setSaving(false);
    }
  };

  const handleMoveDepartment = async (dept: EbDepartmentRecord, direction: 'up' | 'down') => {
    setErr('');
    setMsg('');
    const reordered = moveEbDepartmentOrder(departments, dept.id, direction);
    setDepartments(reordered);

    setSaving(true);
    try {
      for (const row of reordered) {
        const { error } = await sb
          .from('eb_departments')
          .update({ sort_order: row.sort_order })
          .eq('id', row.id);
        if (error) {
          setErr(error.message || 'Could not save department order.');
          await loadBoard();
          return;
        }
      }
      await log('eb.department.reorder', { id: dept.id, name: dept.name, direction });
      setMsg(`Updated order for "${dept.name}".`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const issue = validateEbDepartmentInput(deptDraft);
    if (issue) {
      setErr(issue);
      return;
    }

    const cleanName = deptDraft.name.trim();
    setSaving(true);
    try {
      if (deptDraft.id) {
        const { error } = await sb
          .from('eb_departments')
          .update({ name: cleanName })
          .eq('id', deptDraft.id);
        if (error) {
          setErr(error.message || 'Could not rename department.');
          return;
        }
        await log('eb.department.update', { id: deptDraft.id, name: cleanName });
        setMsg(`Renamed department to "${cleanName}".`);
      } else {
        const nextSort = departments.reduce((max, d) => Math.max(max, Number(d.sort_order) || 0), -1) + 1;
        const { error } = await sb
          .from('eb_departments')
          .insert({ name: cleanName, sort_order: nextSort });
        if (error) {
          setErr(error.message || 'Could not add department.');
          return;
        }
        await log('eb.department.create', { name: cleanName });
        setMsg(`Added department "${cleanName}".`);
      }
      setDeptFormOpen(false);
      setDeptDraft(EMPTY_DEPARTMENT_DRAFT);
      await loadBoard();
    } finally {
      setSaving(false);
    }
  };

  const handleSeedInitialEb = async () => {
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      const existingDeptsByName = new Map(
        departments.map((d) => [d.name.trim().toLowerCase(), d])
      );

      for (const seedDept of INITIAL_EB_STRUCTURE) {
        if (!existingDeptsByName.has(seedDept.name.toLowerCase())) {
          const { data, error } = await sb
            .from('eb_departments')
            .insert({ name: seedDept.name, sort_order: seedDept.sort_order })
            .select('id, name, sort_order')
            .single();
          if (error) {
            setErr(error.message || 'Could not initialize EB departments.');
            return;
          }
          if (data) existingDeptsByName.set(seedDept.name.toLowerCase(), data);
        }
      }

      const existingMemberKeys = new Set(
        members.map((m) => `${m.department_id}::${m.full_name.trim().toLowerCase()}`)
      );
      const toInsert: Array<{ department_id: string; full_name: string; role: string; sort_order: number }> = [];

      for (const seedDept of INITIAL_EB_STRUCTURE) {
        const deptRow = existingDeptsByName.get(seedDept.name.toLowerCase());
        if (!deptRow) continue;
        seedDept.members.forEach((m, idx) => {
          const key = `${deptRow.id}::${m.full_name.trim().toLowerCase()}`;
          if (!existingMemberKeys.has(key)) {
            toInsert.push({
              department_id: deptRow.id,
              full_name: m.full_name,
              role: m.role,
              sort_order: idx
            });
          }
        });
      }

      if (toInsert.length > 0) {
        const { error } = await sb.from('eb_members').insert(toInsert);
        if (error) {
          setErr(error.message || 'Could not initialize EB members.');
          return;
        }
      }

      await log('eb.seed', { inserted_members: toInsert.length });
      setMsg(
        toInsert.length > 0
          ? `Loaded ${toInsert.length} initial Executive Board entries into Supabase.`
          : 'All initial Executive Board departments and members are already present.'
      );
      await loadBoard();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">WEBSITE / EXECUTIVE BOARD</p>
          <h1>EB Members Management</h1>
          <p>
            Manage departments, member names, roles, and ordering for the public Executive Board section.
            Text-only directory — no photos or contact information are stored or published here.
          </p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button type="button" className="btn ghost" onClick={() => void loadBoard()} disabled={saving}>
            Refresh
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setDeptManagerOpen((prev) => !prev)}
            disabled={migrationMissing}
          >
            <Layers size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {deptManagerOpen ? 'Hide department order' : 'Reorder departments'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => openCreateMember()}
            disabled={migrationMissing || departments.length === 0}
          >
            <Plus size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Add member
          </button>
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">EB Members</span>
            <Users className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{members.length}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Departments</span>
            <Layers className="admin-stat-icon" size={17} />
          </div>
          <strong className="admin-stat-value">{departments.length}</strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Visible Departments</span>
          </div>
          <strong className="admin-stat-value">
            {groups.filter((g) => g.members.length > 0).length}
          </strong>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-top">
            <span className="admin-stat-label">Public Sync</span>
          </div>
          <strong className="admin-stat-value" style={{ fontSize: 18 }}>
            {migrationMissing ? 'SQL Pending' : members.length > 0 ? 'Live Supabase' : 'Built-in Seed'}
          </strong>
        </div>
      </div>

      {msg && (
        <div className="msg" role="status" style={{ fontWeight: 600 }}>
          {msg}
        </div>
      )}
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}

      {!migrationMissing && !loading && members.length === 0 && (
        <div className="admin-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p className="admin-kicker">INITIALIZE SUPABASE DATA</p>
            <h3 style={{ margin: '0 0 4px' }}>Load official Executive Board directory</h3>
            <p style={{ margin: 0 }}>
              Populate all 13 departments and 37 initial Executive Board members in Supabase so edits publish automatically.
            </p>
          </div>
          <button type="button" className="btn" disabled={saving} onClick={() => void handleSeedInitialEb()}>
            Load Initial EB Data
          </button>
        </div>
      )}

      {deptManagerOpen && (
        <section className="admin-panel" aria-label="Department ordering and editing">
          <div className="admin-filter-heading">
            <div>
              <p className="admin-kicker">DEPARTMENT ORDER &amp; TITLES</p>
              <h2 style={{ margin: 0 }}>Departments ({departments.length})</h2>
            </div>
            <div className="toolbar" style={{ margin: 0 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setDeptDraft(EMPTY_DEPARTMENT_DRAFT);
                  setDeptFormOpen(true);
                }}
              >
                <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                New department
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-label="Close department manager"
                onClick={() => setDeptManagerOpen(false)}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {deptFormOpen && (
            <form
              onSubmit={handleSaveDepartment}
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '12px 14px',
                marginBottom: 14,
                background: '#FAF6EE',
                border: '1px solid #BAB1A0',
                borderRadius: 8
              }}
            >
              <label htmlFor="eb-dept-name-input" style={{ fontWeight: 600 }}>
                {deptDraft.id ? 'Rename department' : 'New department name'}
              </label>
              <input
                id="eb-dept-name-input"
                required
                value={deptDraft.name}
                onChange={(e) => setDeptDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Secretariat"
                style={{ flex: '1 1 220px' }}
              />
              <button type="submit" className="btn" disabled={saving}>
                <Check size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                {deptDraft.id ? 'Save name' : 'Add department'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setDeptFormOpen(false);
                  setDeptDraft(EMPTY_DEPARTMENT_DRAFT);
                }}
              >
                Cancel
              </button>
            </form>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {departments.map((dept, idx) => {
              const memberCount = members.filter((m) => m.department_id === dept.id).length;
              return (
                <div
                  key={dept.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    background: '#FBF8F1',
                    border: '1px solid #D2C9BB',
                    borderRadius: 8
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 650, color: '#1A1217' }}>
                      {String(idx + 1).padStart(2, '0')}. {dept.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#61575A' }}>
                      {memberCount} {memberCount === 1 ? 'member' : 'members'}
                    </div>
                  </div>
                  <div className="toolbar" style={{ margin: 0, gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '5px 8px' }}
                      disabled={saving || idx === 0}
                      aria-label={`Move ${dept.name} department up`}
                      onClick={() => void handleMoveDepartment(dept, 'up')}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '5px 8px' }}
                      disabled={saving || idx === departments.length - 1}
                      aria-label={`Move ${dept.name} department down`}
                      onClick={() => void handleMoveDepartment(dept, 'down')}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '5px 8px' }}
                      disabled={saving}
                      aria-label={`Rename ${dept.name} department`}
                      onClick={() => {
                        setDeptDraft({ id: dept.id, name: dept.name });
                        setDeptFormOpen(true);
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {memberFormOpen && (
        <form
          className="admin-panel"
          onSubmit={handleSaveMember}
          aria-label={memberDraft.id ? 'Edit EB member form' : 'Add EB member form'}
        >
          <div className="admin-filter-heading">
            <div>
              <p className="admin-kicker">{memberDraft.id ? 'EDIT EB MEMBER' : 'NEW EB MEMBER'}</p>
              <h2 style={{ margin: 0 }}>
                {memberDraft.id ? `Edit "${memberDraft.full_name}"` : 'Add Executive Board member'}
              </h2>
            </div>
            <button type="button" className="btn ghost" onClick={closeMemberForm} aria-label="Close member form">
              <X size={15} />
            </button>
          </div>

          <div className="f-grid">
            <div className="field">
              <label htmlFor="eb-member-name">
                Full name<span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="eb-member-name"
                required
                value={memberDraft.full_name}
                onChange={(e) => setMemberDraft((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="e.g., Laila Mohammad"
              />
            </div>

            <div className="field">
              <label htmlFor="eb-member-role">
                Role / Title<span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="eb-member-role"
                required
                value={memberDraft.role}
                onChange={(e) => setMemberDraft((prev) => ({ ...prev, role: e.target.value }))}
                placeholder="e.g., Head, Co-Head, Secretary General (SG)"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="eb-member-dept">
              Department<span className="req" aria-hidden="true">*</span>
            </label>
            <select
              id="eb-member-dept"
              required
              value={memberDraft.department_id}
              onChange={(e) => setMemberDraft((prev) => ({ ...prev, department_id: e.target.value }))}
            >
              <option value="">Select department...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar" style={{ margin: 0 }}>
            <button type="submit" className="btn" disabled={saving}>
              <Check size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {saving ? 'Saving...' : memberDraft.id ? 'Save member changes' : 'Add EB member'}
            </button>
            <button type="button" className="btn ghost" disabled={saving} onClick={closeMemberForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {deleteMemberTarget && (
        <div
          className="admin-panel"
          role="dialog"
          aria-modal="false"
          aria-label={`Confirm removal of ${deleteMemberTarget.full_name}`}
          style={{ borderColor: '#8A2B2B', background: '#FBF3F1' }}
        >
          <p className="admin-kicker" style={{ color: '#6B1F1F' }}>CONFIRM MEMBER REMOVAL</p>
          <h3 style={{ margin: '0 0 6px' }}>Remove &ldquo;{deleteMemberTarget.full_name}&rdquo;?</h3>
          <p style={{ margin: '0 0 14px' }}>
            This removes {deleteMemberTarget.full_name} ({deleteMemberTarget.role}) from{' '}
            {deptNameById.get(deleteMemberTarget.department_id) || 'the department'} and updates the public Executive Board section.
          </p>
          <div className="toolbar" style={{ margin: 0 }}>
            <button type="button" className="btn red" disabled={saving} onClick={() => void handleConfirmDeleteMember()}>
              Confirm delete
            </button>
            <button type="button" className="btn ghost" disabled={saving} onClick={() => setDeleteMemberTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-filter-panel">
        <div className="admin-filter-heading">
          <p className="admin-kicker">FILTER EXECUTIVE BOARD</p>
          <span className="admin-filter-count">
            Showing {filteredGroups.reduce((sum, g) => sum + g.members.length, 0)} of {members.length} members
          </span>
        </div>
        <div className="admin-filter-grid">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by member name, role, or department..."
            aria-label="Search Executive Board members"
          />
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            aria-label="Filter by department"
          >
            <option value="ALL">All Departments ({departments.length})</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setSearch('');
              setDeptFilter('ALL');
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-panel">Loading Executive Board directory...</div>
      ) : filteredGroups.length === 0 ? (
        <div className="admin-empty-state">
          <Users size={24} />
          <strong>No Executive Board entries match your filters</strong>
          <p>Clear your search or filter to view all departments and members.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredGroups.map((group) => {
            const deptIndex = departments.findIndex((d) => d.id === group.department.id);
            const canReorderWithinDept = search.trim() === '';
            return (
              <section key={group.department.id} className="admin-panel" aria-label={group.department.name}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    paddingBottom: 12,
                    marginBottom: 12,
                    borderBottom: '1px solid #D2C9BB'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <span className="admin-kicker" style={{ margin: '0 !important', color: '#2F6B34 !important' }}>
                      {String(deptIndex + 1).padStart(2, '0')}
                    </span>
                    <h2 style={{ margin: 0 }}>{group.department.name}</h2>
                    <span style={{ fontSize: 13, color: '#61575A' }}>
                      {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <div className="toolbar" style={{ margin: 0, gap: 6 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      disabled={saving || deptIndex <= 0}
                      aria-label={`Move ${group.department.name} up`}
                      onClick={() => void handleMoveDepartment(group.department, 'up')}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      disabled={saving || deptIndex === -1 || deptIndex >= departments.length - 1}
                      aria-label={`Move ${group.department.name} down`}
                      onClick={() => void handleMoveDepartment(group.department, 'down')}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '6px 11px', fontSize: 12 }}
                      onClick={() => openCreateMember(group.department.id)}
                    >
                      <Plus size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                      Add to {group.department.name}
                    </button>
                  </div>
                </div>

                {group.members.length === 0 ? (
                  <p style={{ margin: 0, fontStyle: 'italic' }}>No members assigned to this department yet.</p>
                ) : (
                  <div className="tw" style={{ margin: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '42%' }}>Member Name</th>
                          <th style={{ width: '28%' }}>Role</th>
                          <th style={{ width: '30%' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.members.map((member, mIdx) => (
                          <tr key={member.id}>
                            <td style={{ fontWeight: 600 }}>{member.full_name}</td>
                            <td>{member.role}</td>
                            <td>
                              <div className="toolbar" style={{ margin: 0, gap: 6 }}>
                                <button
                                  type="button"
                                  className="btn ghost"
                                  style={{ padding: '5px 9px', fontSize: 12 }}
                                  disabled={saving || !canReorderWithinDept || mIdx === 0}
                                  aria-label={`Move ${member.full_name} up`}
                                  onClick={() => void handleMoveMember(member, 'up')}
                                >
                                  <ArrowUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="btn ghost"
                                  style={{ padding: '5px 9px', fontSize: 12 }}
                                  disabled={saving || !canReorderWithinDept || mIdx === group.members.length - 1}
                                  aria-label={`Move ${member.full_name} down`}
                                  onClick={() => void handleMoveMember(member, 'down')}
                                >
                                  <ArrowDown size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="btn ghost"
                                  style={{ padding: '5px 10px', fontSize: 12 }}
                                  disabled={saving}
                                  aria-label={`Edit ${member.full_name}`}
                                  onClick={() => openEditMember(member)}
                                >
                                  <Pencil size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn red"
                                  style={{ padding: '5px 10px', fontSize: 12 }}
                                  disabled={saving}
                                  aria-label={`Delete ${member.full_name}`}
                                  onClick={() => setDeleteMemberTarget(member)}
                                >
                                  <Trash2 size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
