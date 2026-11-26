import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  Check,
  CheckSquare,
  GitBranch,
  Plus,
  RefreshCw,
  ShieldAlert,
  Users
} from 'lucide-react';
import { wouldCreateHierarchyCycle } from '../../utils/managementLogic';

interface DepartmentsViewProps {
  sb: any;
  me: any;
  log: (action: string, details?: Record<string, unknown>) => Promise<unknown> | unknown;
}

export const DepartmentsRegistryView: React.FC<DepartmentsViewProps> = ({ sb, log }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDept, setNewDept] = useState({ name: '', slug: '', category: 'conference', description: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await sb.from('departments').select('*').order('sort_order');
    if (error) setErr(error.message);
    else setRows(data || []);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFlag = async (row: any, field: 'active' | 'registration_open' | 'head_review_enabled' | 'section_required') => {
    setErr('');
    setMsg('');
    const nextVal = !row[field];
    const { error } = await sb.from('departments').update({ [field]: nextVal }).eq('id', row.id);
    if (error) {
      setErr(error.message);
      return;
    }
    await log('department_updated', { department: row.name, field, value: nextVal });
    setMsg(`Updated ${row.name} (${field} = ${String(nextVal)}).`);
    await load();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const cleanName = newDept.name.trim();
    const cleanSlug = (newDept.slug || cleanName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!cleanName || !cleanSlug) {
      setErr('Department name is required.');
      return;
    }
    const { error } = await sb.from('departments').insert({
      name: cleanName,
      slug: cleanSlug,
      category: newDept.category,
      description: newDept.description.trim(),
      sort_order: rows.length + 1
    });
    if (error) {
      setErr(error.message);
      return;
    }
    await log('department_created', { name: cleanName, slug: cleanSlug });
    setNewDept({ name: '', slug: '', category: 'conference', description: '' });
    setMsg(`Created department "${cleanName}".`);
    await load();
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">TEAM &amp; GOVERNANCE / DEPARTMENTS</p>
          <h1>Departments Registry</h1>
          <p>Configure Veritas MUN departments, registration availability, Department Head review permissions, and Security gender sections.</p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void load()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      {msg && <div className="msg" role="status" style={{ fontWeight: 600 }}>{msg}</div>}
      {err && <div className="err" role="alert">{err}</div>}

      <form className="admin-panel" onSubmit={handleAdd}>
        <p className="admin-kicker">ADD DEPARTMENT</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          <input required placeholder="Name (e.g. Academic Affairs)" value={newDept.name} onChange={e => setNewDept(p => ({ ...p, name: e.target.value }))} />
          <input placeholder="Slug (auto if blank)" value={newDept.slug} onChange={e => setNewDept(p => ({ ...p, slug: e.target.value }))} />
          <select value={newDept.category} onChange={e => setNewDept(p => ({ ...p, category: e.target.value }))}>
            <option value="secretariat">Secretariat</option>
            <option value="operations">Operations</option>
            <option value="applications">Applications</option>
            <option value="conference">Conference</option>
          </select>
          <input placeholder="Description" value={newDept.description} onChange={e => setNewDept(p => ({ ...p, description: e.target.value }))} />
        </div>
        <button type="submit" className="btn" style={{ marginTop: 10 }}>
          <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Add Department
        </button>
      </form>

      {loading ? (
        <div className="admin-panel">Loading departments...</div>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>Category</th>
                <th>Registration Open</th>
                <th>Head Review</th>
                <th>Section Required</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <Building2 size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                    <strong>{r.name}</strong>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{r.description}</div>
                  </td>
                  <td>{r.category}</td>
                  <td><input type="checkbox" checked={Boolean(r.registration_open)} onChange={() => void toggleFlag(r, 'registration_open')} /></td>
                  <td><input type="checkbox" checked={Boolean(r.head_review_enabled)} onChange={() => void toggleFlag(r, 'head_review_enabled')} /></td>
                  <td><input type="checkbox" checked={Boolean(r.section_required)} onChange={() => void toggleFlag(r, 'section_required')} /></td>
                  <td><input type="checkbox" checked={Boolean(r.active)} onChange={() => void toggleFlag(r, 'active')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const OperationsWorkspaceView: React.FC<DepartmentsViewProps> = ({ sb, me, log }) => {
  const [subTab, setSubTab] = useState<'tasks' | 'shifts' | 'hierarchy' | 'incidents' | 'notifications'>('tasks');
  const [tasks, setTasks] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [secEvents, setSecEvents] = useState<any[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const isLeader = me.role === 'admin' || me.role === 'head';
  const defaultDept = me.department || 'Security';

  const [newTask, setNewTask] = useState({ title: '', department: defaultDept, priority: 'medium', assigned_to: '', description: '' });
  const [newShift, setNewShift] = useState({ title: '', department: defaultDept, location: '', shift_date: '', start_time: '', end_time: '', capacity: 5 });
  const [assignDraft, setAssignDraft] = useState({ shift_id: '', user_id: '' });
  const [newGroup, setNewGroup] = useState({ name: '', department: defaultDept, description: '' });
  const [newPos, setNewPos] = useState({ title: '', department: defaultDept, parent_position_id: '', holder_user_id: '' });
  const [newIncident, setNewIncident] = useState({ title: '', department: defaultDept, severity: 'medium', category: 'Conduct', location: '', description: '' });
  const [newNotif, setNewNotif] = useState({ title: '', body: '', target_role: 'all', target_department: '', kind: 'info' });

  const loadAll = useCallback(async () => {
    setErr('');
    const [tRes, shRes, asRes, swRes, gRes, posRes, incRes, nRes, pRes] = await Promise.all([
      sb.from('department_tasks').select('*').order('created_at', { ascending: false }),
      sb.from('department_shifts').select('*').order('shift_date').order('start_time'),
      sb.from('department_shift_assignments').select('*').order('assigned_at', { ascending: false }),
      sb.from('shift_swap_requests').select('*').order('created_at', { ascending: false }),
      sb.from('team_groups').select('*').order('name'),
      sb.from('department_positions').select('*').order('rank_order').order('title'),
      sb.from('operations_incidents').select('*').order('created_at', { ascending: false }),
      sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40),
      sb.from('profiles').select('id, full_name, email, department, role, active').eq('active', true).order('full_name')
    ]);

    if (!tRes.error) setTasks(tRes.data || []);
    if (!shRes.error) setShifts(shRes.data || []);
    if (!asRes.error) setAssignments(asRes.data || []);
    if (!swRes.error) setSwaps(swRes.data || []);
    if (!gRes.error) setGroups(gRes.data || []);
    if (!posRes.error) setPositions(posRes.data || []);
    if (!incRes.error) setIncidents(incRes.data || []);
    if (!nRes.error) setNotifications(nRes.data || []);
    if (!pRes.error) setStaffProfiles(pRes.data || []);

    if (me.role === 'admin') {
      const evRes = await sb.from('security_events').select('*').order('created_at', { ascending: false }).limit(30);
      if (!evRes.error) setSecEvents(evRes.data || []);
    }
  }, [sb, me.role]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const profileById = new Map(staffProfiles.map(p => [p.id, p]));

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const { error } = await sb.from('department_tasks').insert({
      title: newTask.title.trim(),
      department: newTask.department.trim() || defaultDept,
      priority: newTask.priority,
      assigned_to: newTask.assigned_to || null,
      assigned_by: me.id,
      description: newTask.description.trim()
    });
    if (error) { setErr(error.message); return; }
    await log('ops_task_created', { title: newTask.title.trim() });
    setNewTask({ ...newTask, title: '', description: '' });
    setMsg('Task created.');
    await loadAll();
  };

  const handleTaskStatus = async (taskId: string, status: string) => {
    setErr('');
    const { error } = await sb.from('department_tasks').update({ status }).eq('id', taskId);
    if (error) { setErr(error.message); return; }
    await loadAll();
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const { error } = await sb.from('department_shifts').insert({
      ...newShift,
      title: newShift.title.trim(),
      department: newShift.department.trim() || defaultDept,
      created_by: me.id
    });
    if (error) { setErr(error.message); return; }
    setNewShift({ ...newShift, title: '', location: '', start_time: '', end_time: '' });
    setMsg('Shift created.');
    await loadAll();
  };

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignDraft.shift_id || !assignDraft.user_id) return;
    setErr(''); setMsg('');
    const { error } = await sb.from('department_shift_assignments').insert(assignDraft);
    if (error) { setErr(error.message); return; }
    setMsg('Staff member assigned to shift.');
    await loadAll();
  };

  const handleRequestSwap = async (assignmentId: string) => {
    setErr(''); setMsg('');
    const { error } = await sb.from('shift_swap_requests').insert({
      assignment_id: assignmentId,
      requester_id: me.id,
      reason: 'Requested shift coverage swap'
    });
    if (error) { setErr(error.message); return; }
    setMsg('Shift swap request submitted.');
    await loadAll();
  };

  const handleSwapDecision = async (swapId: string, status: 'approved' | 'rejected') => {
    setErr(''); setMsg('');
    const { error } = await sb
      .from('shift_swap_requests')
      .update({ status, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
      .eq('id', swapId);
    if (error) { setErr(error.message); return; }
    setMsg(`Shift swap ${status}.`);
    await loadAll();
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const { error } = await sb.from('team_groups').insert({
      name: newGroup.name.trim(),
      department: newGroup.department.trim() || defaultDept,
      description: newGroup.description.trim(),
      created_by: me.id
    });
    if (error) { setErr(error.message); return; }
    setNewGroup({ ...newGroup, name: '', description: '' });
    setMsg('Team group created.');
    await loadAll();
  };

  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const tempId = 'new-node';
    if (
      newPos.parent_position_id &&
      wouldCreateHierarchyCycle(positions, tempId, newPos.parent_position_id)
    ) {
      setErr('Cycle detected in hierarchy chain.');
      return;
    }
    const { error } = await sb.from('department_positions').insert({
      title: newPos.title.trim(),
      department: newPos.department.trim() || defaultDept,
      parent_position_id: newPos.parent_position_id || null,
      holder_user_id: newPos.holder_user_id || null
    });
    if (error) { setErr(error.message); return; }
    setNewPos({ ...newPos, title: '', parent_position_id: '' });
    setMsg('Position node added to department hierarchy.');
    await loadAll();
  };

  const handleReparentPosition = async (posId: string, parentId: string) => {
    setErr(''); setMsg('');
    if (wouldCreateHierarchyCycle(positions, posId, parentId || null)) {
      setErr('Hierarchy cycle prevented: a position cannot report directly or indirectly to itself.');
      return;
    }
    const { error } = await sb
      .from('department_positions')
      .update({ parent_position_id: parentId || null })
      .eq('id', posId);
    if (error) { setErr(error.message); return; }
    setMsg('Updated hierarchy reporting line.');
    await loadAll();
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const { error } = await sb.from('operations_incidents').insert({
      ...newIncident,
      title: newIncident.title.trim(),
      reported_by: me.id
    });
    if (error) { setErr(error.message); return; }
    setNewIncident({ ...newIncident, title: '', location: '', description: '' });
    setMsg('Incident report logged.');
    await loadAll();
  };

  const handleResolveIncident = async (incId: string, status: 'investigating' | 'resolved') => {
    setErr(''); setMsg('');
    const { error } = await sb
      .from('operations_incidents')
      .update({
        status,
        resolved_by: status === 'resolved' ? me.id : null,
        resolution_note: status === 'resolved' ? `Resolved by ${me.full_name}` : ''
      })
      .eq('id', incId);
    if (error) { setErr(error.message); return; }
    await loadAll();
  };

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    const { error } = await sb.from('notifications').insert({
      ...newNotif,
      title: newNotif.title.trim(),
      body: newNotif.body.trim(),
      created_by: me.id
    });
    if (error) { setErr(error.message); return; }
    setNewNotif({ title: '', body: '', target_role: 'all', target_department: '', kind: 'info' });
    setMsg('Notification dispatched.');
    await loadAll();
  };

  const markRead = async (notifId: string) => {
    await sb.rpc('mark_notification_read', { p_notification_id: notifId });
    await loadAll();
  };

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-kicker">OPERATIONS &amp; STAFF WORKSPACE</p>
          <h1>Tasks, Shifts, Hierarchy &amp; Incidents</h1>
          <p>Postgres-backed conference floor workspace scoped by department and role with cycle-safe hierarchy validation and shift swap tracking.</p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void loadAll()}>
          <RefreshCw size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Refresh
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" className={subTab === 'tasks' ? 'on' : ''} onClick={() => setSubTab('tasks')}>
          <CheckSquare size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Tasks ({tasks.length})
        </button>
        <button type="button" className={subTab === 'shifts' ? 'on' : ''} onClick={() => setSubTab('shifts')}>
          <CalendarClock size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Shifts &amp; Swaps ({shifts.length})
        </button>
        <button type="button" className={subTab === 'hierarchy' ? 'on' : ''} onClick={() => setSubTab('hierarchy')}>
          <GitBranch size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Groups &amp; Hierarchy
        </button>
        <button type="button" className={subTab === 'incidents' ? 'on' : ''} onClick={() => setSubTab('incidents')}>
          <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Incidents ({incidents.length})
        </button>
        <button type="button" className={subTab === 'notifications' ? 'on' : ''} onClick={() => setSubTab('notifications')}>
          <Bell size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Notifications ({notifications.length})
        </button>
      </div>

      {msg && <div className="msg" role="status" style={{ fontWeight: 600 }}>{msg}</div>}
      {err && <div className="err" role="alert">{err}</div>}

      {subTab === 'tasks' && (
        <>
          {isLeader && (
            <form className="admin-panel" onSubmit={handleCreateTask}>
              <p className="admin-kicker">ASSIGN DEPARTMENT TASK</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <input required placeholder="Task title" value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} />
                <input placeholder="Department" value={newTask.department} onChange={e => setNewTask(p => ({ ...p, department: e.target.value }))} />
                <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select value={newTask.assigned_to} onChange={e => setNewTask(p => ({ ...p, assigned_to: e.target.value }))}>
                  <option value="">Assign to staff member...</option>
                  {staffProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.department})</option>)}
                </select>
              </div>
              <textarea placeholder="Instructions / details" value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} style={{ marginTop: 10, minHeight: 68 }} />
              <button type="submit" className="btn" style={{ marginTop: 10 }}>Create Task</button>
            </form>
          )}
          <div className="tw">
            <table>
              <thead><tr><th>Task</th><th>Department</th><th>Assignee</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.title}</strong><div style={{ fontSize: 12, opacity: 0.78 }}>{t.description}</div></td>
                    <td>{t.department}</td>
                    <td>{t.assigned_to ? (profileById.get(t.assigned_to)?.full_name || 'Assigned') : 'Unassigned'}</td>
                    <td><span className={t.priority === 'urgent' || t.priority === 'high' ? 'badge r' : 'badge'} style={{ marginLeft: 0 }}>{t.priority}</span></td>
                    <td>
                      <select value={t.status} onChange={e => void handleTaskStatus(t.id, e.target.value)}>
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Done</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'shifts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isLeader && (
            <form className="admin-panel" onSubmit={handleCreateShift}>
              <p className="admin-kicker">CREATE FLOOR SHIFT</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                <input required placeholder="Shift title (e.g. Gate A Morning)" value={newShift.title} onChange={e => setNewShift(p => ({ ...p, title: e.target.value }))} />
                <input placeholder="Department" value={newShift.department} onChange={e => setNewShift(p => ({ ...p, department: e.target.value }))} />
                <input placeholder="Location / Post" value={newShift.location} onChange={e => setNewShift(p => ({ ...p, location: e.target.value }))} />
                <input placeholder="Date (e.g. Day 1)" value={newShift.shift_date} onChange={e => setNewShift(p => ({ ...p, shift_date: e.target.value }))} />
                <input placeholder="Start (e.g. 08:00)" value={newShift.start_time} onChange={e => setNewShift(p => ({ ...p, start_time: e.target.value }))} />
                <input placeholder="End (e.g. 12:00)" value={newShift.end_time} onChange={e => setNewShift(p => ({ ...p, end_time: e.target.value }))} />
              </div>
              <button type="submit" className="btn" style={{ marginTop: 10 }}>Create Shift</button>
            </form>
          )}
          {isLeader && shifts.length > 0 && (
            <form className="admin-panel" onSubmit={handleAssignShift}>
              <p className="admin-kicker">ASSIGN STAFF TO SHIFT</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select required value={assignDraft.shift_id} onChange={e => setAssignDraft(p => ({ ...p, shift_id: e.target.value }))}>
                  <option value="">Select shift...</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.title} ({s.department} · {s.start_time}-{s.end_time})</option>)}
                </select>
                <select required value={assignDraft.user_id} onChange={e => setAssignDraft(p => ({ ...p, user_id: e.target.value }))}>
                  <option value="">Select staff member...</option>
                  {staffProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.department})</option>)}
                </select>
                <button type="submit" className="btn ghost">Assign</button>
              </div>
            </form>
          )}
          <div className="tw">
            <table>
              <thead><tr><th>Shift</th><th>Department &amp; Location</th><th>Window</th><th>Assigned Staff</th><th>Action</th></tr></thead>
              <tbody>
                {assignments.map(as => {
                  const sh = shifts.find(s => s.id === as.shift_id);
                  const holder = profileById.get(as.user_id);
                  return (
                    <tr key={as.id}>
                      <td><strong>{sh?.title || 'Shift'}</strong></td>
                      <td>{sh?.department} · {sh?.location || '-'}</td>
                      <td>{sh?.shift_date} {sh?.start_time}-{sh?.end_time}</td>
                      <td>{holder?.full_name || as.user_id}</td>
                      <td>
                        {as.user_id === me.id && (
                          <button type="button" className="btn ghost" onClick={() => void handleRequestSwap(as.id)}>
                            Request Swap
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {swaps.length > 0 && (
            <section className="admin-panel">
              <p className="admin-kicker">SHIFT SWAP REQUESTS</p>
              {swaps.map(sw => (
                <div key={sw.id} className="admin-activity-row">
                  <span>
                    <strong>{profileById.get(sw.requester_id)?.full_name || sw.requester_id}</strong> — {sw.reason}{' '}
                    <span className={sw.status === 'approved' ? 'badge g' : sw.status === 'rejected' ? 'badge r' : 'badge'}>{sw.status}</span>
                  </span>
                  {isLeader && sw.status === 'pending' && (
                    <div className="toolbar" style={{ margin: 0 }}>
                      <button type="button" className="btn" onClick={() => void handleSwapDecision(sw.id, 'approved')}>Approve</button>
                      <button type="button" className="btn red" onClick={() => void handleSwapDecision(sw.id, 'rejected')}>Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {subTab === 'hierarchy' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <section className="admin-panel">
            <p className="admin-kicker"><Users size={12} /> TEAM GROUPS ({groups.length})</p>
            {isLeader && (
              <form onSubmit={handleCreateGroup} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input required placeholder="Group name (e.g. Gate A Squad)" value={newGroup.name} onChange={e => setNewGroup(p => ({ ...p, name: e.target.value }))} />
                  <input placeholder="Department" value={newGroup.department} onChange={e => setNewGroup(p => ({ ...p, department: e.target.value }))} />
                  <button type="submit" className="btn">Add Group</button>
                </div>
              </form>
            )}
            {groups.map(g => (
              <div key={g.id} className="admin-activity-row">
                <span><strong>{g.name}</strong> ({g.department})</span>
              </div>
            ))}
          </section>

          <section className="admin-panel">
            <p className="admin-kicker"><GitBranch size={12} /> CYCLE-SAFE POSITION HIERARCHY</p>
            {isLeader && (
              <form onSubmit={handleCreatePosition} style={{ marginBottom: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <input required placeholder="Position title (e.g. Shift Lead)" value={newPos.title} onChange={e => setNewPos(p => ({ ...p, title: e.target.value }))} />
                  <select value={newPos.parent_position_id} onChange={e => setNewPos(p => ({ ...p, parent_position_id: e.target.value }))}>
                    <option value="">Top-level (no parent)</option>
                    {positions.map(p => <option key={p.id} value={p.id}>Reports to: {p.title} ({p.department})</option>)}
                  </select>
                  <button type="submit" className="btn">Add Hierarchy Node</button>
                </div>
              </form>
            )}
            {positions.map(pos => (
              <div key={pos.id} className="admin-activity-row" style={{ alignItems: 'center' }}>
                <span><strong>{pos.title}</strong> ({pos.department})</span>
                {isLeader && (
                  <select
                    aria-label={`Parent for ${pos.title}`}
                    value={pos.parent_position_id || ''}
                    onChange={e => void handleReparentPosition(pos.id, e.target.value)}
                  >
                    <option value="">Top-level</option>
                    {positions.filter(o => o.id !== pos.id).map(o => (
                      <option key={o.id} value={o.id}>Reports to: {o.title}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </section>
        </div>
      )}

      {subTab === 'incidents' && (
        <>
          <form className="admin-panel" onSubmit={handleCreateIncident}>
            <p className="admin-kicker">LOG FLOOR / SECURITY INCIDENT</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <input required placeholder="Incident summary" value={newIncident.title} onChange={e => setNewIncident(p => ({ ...p, title: e.target.value }))} />
              <input placeholder="Department" value={newIncident.department} onChange={e => setNewIncident(p => ({ ...p, department: e.target.value }))} />
              <select value={newIncident.severity} onChange={e => setNewIncident(p => ({ ...p, severity: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <input placeholder="Location (e.g. Hall B)" value={newIncident.location} onChange={e => setNewIncident(p => ({ ...p, location: e.target.value }))} />
            </div>
            <textarea placeholder="Detailed incident description..." value={newIncident.description} onChange={e => setNewIncident(p => ({ ...p, description: e.target.value }))} style={{ marginTop: 10, minHeight: 70 }} />
            <button type="submit" className="btn" style={{ marginTop: 10 }}>Report Incident</button>
          </form>

          <div className="tw">
            <table>
              <thead><tr><th>Incident</th><th>Dept &amp; Location</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.id}>
                    <td><strong>{inc.title}</strong><div style={{ fontSize: 12, opacity: 0.78 }}>{inc.description}</div></td>
                    <td>{inc.department} · {inc.location || '-'}</td>
                    <td><span className={inc.severity === 'critical' || inc.severity === 'high' ? 'badge r' : 'badge'} style={{ marginLeft: 0 }}>{inc.severity}</span></td>
                    <td><span className={inc.status === 'resolved' ? 'badge g' : 'badge'} style={{ marginLeft: 0 }}>{inc.status}</span></td>
                    <td>
                      {isLeader && inc.status !== 'resolved' && (
                        <div className="toolbar" style={{ margin: 0 }}>
                          {inc.status === 'open' && (
                            <button type="button" className="btn ghost" onClick={() => void handleResolveIncident(inc.id, 'investigating')}>Investigate</button>
                          )}
                          <button type="button" className="btn" onClick={() => void handleResolveIncident(inc.id, 'resolved')}>Resolve</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isLeader && (
            <form className="admin-panel" onSubmit={handleCreateNotification}>
              <p className="admin-kicker">DISPATCH POSTGRES NOTIFICATION</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <input required placeholder="Notification title" value={newNotif.title} onChange={e => setNewNotif(p => ({ ...p, title: e.target.value }))} />
                <select value={newNotif.target_role} onChange={e => setNewNotif(p => ({ ...p, target_role: e.target.value }))}>
                  <option value="all">All Active Staff</option>
                  <option value="head">Department Heads Only</option>
                  <option value="admin">EB Admins Only</option>
                </select>
                <input placeholder="Target department (blank = all)" value={newNotif.target_department} onChange={e => setNewNotif(p => ({ ...p, target_department: e.target.value }))} />
              </div>
              <textarea placeholder="Message..." value={newNotif.body} onChange={e => setNewNotif(p => ({ ...p, body: e.target.value }))} style={{ marginTop: 10, minHeight: 64 }} />
              <button type="submit" className="btn" style={{ marginTop: 10 }}>Send Notification</button>
            </form>
          )}

          <section className="admin-panel">
            <p className="admin-kicker">INBOX NOTIFICATIONS</p>
            {notifications.length === 0 ? (
              <p>No notifications yet.</p>
            ) : (
              notifications.map(n => {
                const isRead = Array.isArray(n.read_by) && n.read_by.includes(me.id);
                return (
                  <div key={n.id} className="admin-activity-row" style={{ alignItems: 'center' }}>
                    <div>
                      <strong>{n.title}</strong> {!isRead && <span className="badge g">New</span>}
                      <div style={{ fontSize: 13 }}>{n.body}</div>
                    </div>
                    {!isRead && (
                      <button type="button" className="btn ghost" onClick={() => void markRead(n.id)}>
                        <Check size={13} style={{ marginRight: 4 }} />Mark read
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {me.role === 'admin' && secEvents.length > 0 && (
            <section className="admin-panel">
              <p className="admin-kicker"><ShieldAlert size={12} /> IMMUTABLE SECURITY EVENTS ({secEvents.length})</p>
              {secEvents.map(ev => (
                <div key={ev.id} className="admin-activity-row">
                  <span>
                    <span className={ev.severity === 'critical' || ev.severity === 'warning' ? 'badge r' : 'badge'} style={{ marginLeft: 0, marginRight: 8 }}>
                      {ev.severity}
                    </span>
                    <strong>{ev.event_type}</strong> — {ev.summary}
                  </span>
                  <time>{new Date(ev.created_at).toLocaleString()}</time>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
