export interface EbDepartmentRecord {
  id: string;
  name: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface EbMemberRecord {
  id: string;
  department_id: string;
  full_name: string;
  role: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface EbDepartmentGroup {
  department: EbDepartmentRecord;
  members: EbMemberRecord[];
}

export interface InitialEbDepartmentSeed {
  slug: string;
  name: string;
  sort_order: number;
  members: ReadonlyArray<{
    full_name: string;
    role: string;
  }>;
}

export const INITIAL_EB_STRUCTURE: readonly InitialEbDepartmentSeed[] = [
  {
    slug: 'secretariat',
    name: 'Secretariat',
    sort_order: 0,
    members: [
      { full_name: 'Laila Mohammad', role: 'Secretary General (SG)' },
      { full_name: 'Laya', role: 'Deputy Secretary General (DSG)' },
      { full_name: 'Zain Rawa sheda', role: 'Under-Secretary General (USG)' }
    ]
  },
  {
    slug: 'logistics',
    name: 'Logistics',
    sort_order: 1,
    members: [{ full_name: 'Ahmad El Amir', role: 'Logistics' }]
  },
  {
    slug: 'media-press',
    name: 'Media / Press',
    sort_order: 2,
    members: [
      { full_name: 'Dana Al Najjar', role: 'Female Head' },
      { full_name: 'Najla Rami', role: 'Co-Head' },
      { full_name: 'Yassin El Nahas', role: 'Male Head' }
    ]
  },
  {
    slug: 'security',
    name: 'Security',
    sort_order: 3,
    members: [
      { full_name: 'Karma Mohammed', role: 'Female Head' },
      { full_name: 'Amal Houalla', role: 'Co-Female Head' },
      { full_name: 'Ali Al Ani', role: 'Male Head' }
    ]
  },
  {
    slug: 'senior-advisors',
    name: 'Senior Advisors',
    sort_order: 4,
    members: [
      { full_name: 'Meshal Alqahtani', role: 'Senior Advisor' },
      { full_name: 'Malak Awad', role: 'Senior Advisor' }
    ]
  },
  {
    slug: 'volunteers',
    name: 'Volunteers',
    sort_order: 5,
    members: [
      { full_name: 'Khalid Ibrahim Almahini', role: 'Male Head' },
      { full_name: 'Juana Hamdan', role: 'Female Head' },
      { full_name: 'Thalia Barakat', role: 'Co-Head' }
    ]
  },
  {
    slug: 'human-resources',
    name: 'Human Resources',
    sort_order: 6,
    members: [
      { full_name: 'Rodina Mostafa', role: 'Head' },
      { full_name: 'Adam Abu Ghalwa', role: 'Head' },
      { full_name: 'Talia Almuhtadi', role: 'Co-Head' }
    ]
  },
  {
    slug: 'design',
    name: 'Design',
    sort_order: 7,
    members: [
      { full_name: 'Layan Ahmed', role: 'Head' },
      { full_name: 'Saud Alanzi', role: 'Head' },
      { full_name: 'Helen Manal Sadi', role: 'Co-Head' },
      { full_name: 'Adel Naimi', role: 'Co-Head' }
    ]
  },
  {
    slug: 'it',
    name: 'IT',
    sort_order: 8,
    members: [
      { full_name: 'Mohammed Magdi', role: 'Head' },
      { full_name: 'Ahmed Magdi', role: 'Co-Head' },
      { full_name: 'Saleh Samaha', role: 'Head' }
    ]
  },
  {
    slug: 'marketing',
    name: 'Marketing',
    sort_order: 9,
    members: [
      { full_name: 'Naya Barakat', role: 'Head' },
      { full_name: 'Mohammed El Nahas', role: 'Member' },
      { full_name: 'Adam Abu Taleb', role: 'Member' },
      { full_name: 'Ahmed Tamer El Sayed', role: 'Member' },
      { full_name: 'Rital Marwan Dahdal', role: 'Member' },
      { full_name: 'Mostafa Mahmoud Abdou', role: 'Member' }
    ]
  },
  {
    slug: 'ceremonies',
    name: 'Ceremonies',
    sort_order: 10,
    members: [
      { full_name: 'Aiten Mohamed', role: 'Co-Head' },
      { full_name: 'Ghalyah Alabduldayem', role: 'Head' }
    ]
  },
  {
    slug: 'dcc',
    name: 'DCC',
    sort_order: 11,
    members: [
      { full_name: 'Leen Obeidat', role: 'Head' },
      { full_name: 'Majd Alnajjar', role: 'Co-Head' },
      { full_name: 'Rakan Samer', role: 'Co-Head' }
    ]
  },
  {
    slug: 'pr',
    name: 'PR',
    sort_order: 12,
    members: [{ full_name: 'Lily Rabia', role: 'Head' }]
  }
];

export const DEFAULT_EB_DEPARTMENTS: EbDepartmentRecord[] = INITIAL_EB_STRUCTURE.map((dept) => ({
  id: `dept-${dept.slug}`,
  name: dept.name,
  sort_order: dept.sort_order
}));

export const DEFAULT_EB_MEMBERS: EbMemberRecord[] = INITIAL_EB_STRUCTURE.flatMap((dept) =>
  dept.members.map((member, memberIndex) => ({
    id: `member-${dept.slug}-${memberIndex + 1}`,
    department_id: `dept-${dept.slug}`,
    full_name: member.full_name,
    role: member.role,
    sort_order: memberIndex
  }))
);

export function sortEbDepartments<T extends EbDepartmentRecord>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const orderDiff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    if (orderDiff !== 0) return orderDiff;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return (a.name || '').localeCompare(b.name || '');
  });
}

export function sortEbMembers<T extends EbMemberRecord>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const orderDiff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    if (orderDiff !== 0) return orderDiff;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return (a.full_name || '').localeCompare(b.full_name || '');
  });
}

export function normalizeEbDepartmentRows(rows: unknown): EbDepartmentRecord[] {
  if (!Array.isArray(rows)) return [];
  const clean: EbDepartmentRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `dept-${i}`;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) continue;
    const sort_order = typeof raw.sort_order === 'number' && Number.isFinite(raw.sort_order) ? raw.sort_order : i;
    clean.push({
      id,
      name,
      sort_order,
      created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
      updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined
    });
  }
  return sortEbDepartments(clean);
}

export function normalizeEbMemberRows(rows: unknown): EbMemberRecord[] {
  if (!Array.isArray(rows)) return [];
  const clean: EbMemberRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown> | null;
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `member-${i}`;
    const department_id = typeof raw.department_id === 'string' ? raw.department_id.trim() : '';
    const full_name = typeof raw.full_name === 'string' ? raw.full_name.trim() : '';
    const role = typeof raw.role === 'string' ? raw.role.trim() : '';
    if (!department_id || !full_name || !role) continue;
    const sort_order = typeof raw.sort_order === 'number' && Number.isFinite(raw.sort_order) ? raw.sort_order : i;
    // Intentionally construct public-safe member object with zero email/phone/photo fields
    clean.push({
      id,
      department_id,
      full_name,
      role,
      sort_order,
      created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
      updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined
    });
  }
  return sortEbMembers(clean);
}

export function groupEbByDepartment(
  departments: readonly EbDepartmentRecord[],
  members: readonly EbMemberRecord[],
  options: { includeEmpty?: boolean } = {}
): EbDepartmentGroup[] {
  const orderedDepartments = sortEbDepartments(departments);
  const orderedMembers = sortEbMembers(members);
  const byDept = new Map<string, EbMemberRecord[]>();

  for (const member of orderedMembers) {
    const list = byDept.get(member.department_id) || [];
    list.push({
      id: member.id,
      department_id: member.department_id,
      full_name: member.full_name,
      role: member.role,
      sort_order: member.sort_order,
      created_at: member.created_at,
      updated_at: member.updated_at
    });
    byDept.set(member.department_id, list);
  }

  const groups: EbDepartmentGroup[] = [];
  for (const dept of orderedDepartments) {
    const deptMembers = byDept.get(dept.id) || [];
    if (!options.includeEmpty && deptMembers.length === 0) continue;
    groups.push({
      department: dept,
      members: deptMembers
    });
  }
  return groups;
}

export function validateEbDepartmentInput(input: { name: string }): string | null {
  const name = (input.name || '').trim();
  if (!name) return 'Department name is required.';
  if (name.length > 80) return 'Department name must be 80 characters or fewer.';
  return null;
}

export function validateEbMemberInput(input: {
  full_name: string;
  role: string;
  department_id: string;
}): string | null {
  const fullName = (input.full_name || '').trim();
  const role = (input.role || '').trim();
  const deptId = (input.department_id || '').trim();

  if (!fullName) return 'Member full name is required.';
  if (fullName.length > 120) return 'Member name must be 120 characters or fewer.';
  if (!role) return 'Member role is required.';
  if (role.length > 120) return 'Member role must be 120 characters or fewer.';
  if (!deptId) return 'Please select a department.';
  return null;
}

export function moveEbDepartmentOrder<T extends EbDepartmentRecord>(
  departments: readonly T[],
  targetId: string,
  direction: 'up' | 'down'
): T[] {
  const ordered = sortEbDepartments(departments);
  const idx = ordered.findIndex((d) => d.id === targetId);
  if (idx === -1) return ordered;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) return ordered;

  const copy = [...ordered];
  const temp = copy[idx];
  copy[idx] = copy[swapIdx];
  copy[swapIdx] = temp;

  return copy.map((dept, position) => ({
    ...dept,
    sort_order: position
  }));
}

export function moveEbMemberOrderInDepartment<T extends EbMemberRecord>(
  members: readonly T[],
  targetMemberId: string,
  direction: 'up' | 'down'
): T[] {
  const target = members.find((m) => m.id === targetMemberId);
  if (!target) return [...members];

  const inDept = sortEbMembers(members.filter((m) => m.department_id === target.department_id));
  const idx = inDept.findIndex((m) => m.id === targetMemberId);
  if (idx === -1) return [...members];
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= inDept.length) return [...members];

  const reorderedDept = [...inDept];
  const temp = reorderedDept[idx];
  reorderedDept[idx] = reorderedDept[swapIdx];
  reorderedDept[swapIdx] = temp;

  const updatedById = new Map<string, T>();
  reorderedDept.forEach((item, position) => {
    updatedById.set(item.id, { ...item, sort_order: position });
  });

  return members.map((m) => updatedById.get(m.id) || m);
}

export function changeEbMemberDepartment<T extends EbMemberRecord>(
  members: readonly T[],
  targetMemberId: string,
  nextDepartmentId: string
): T[] {
  const target = members.find((m) => m.id === targetMemberId);
  if (!target || !nextDepartmentId || target.department_id === nextDepartmentId) {
    return [...members];
  }

  const prevDeptMembers = sortEbMembers(
    members.filter((m) => m.department_id === target.department_id && m.id !== targetMemberId)
  ).map((m, idx) => ({ ...m, sort_order: idx }));

  const nextDeptExisting = sortEbMembers(members.filter((m) => m.department_id === nextDepartmentId));
  const movedTarget: T = {
    ...target,
    department_id: nextDepartmentId,
    sort_order: nextDeptExisting.length
  };
  const nextDeptMembers = [...nextDeptExisting, movedTarget].map((m, idx) => ({ ...m, sort_order: idx }));

  const updatedById = new Map<string, T>();
  for (const m of prevDeptMembers) updatedById.set(m.id, m);
  for (const m of nextDeptMembers) updatedById.set(m.id, m);

  return members.map((m) => updatedById.get(m.id) || m);
}
