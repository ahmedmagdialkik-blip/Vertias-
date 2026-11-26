import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EB_DEPARTMENTS,
  DEFAULT_EB_MEMBERS,
  INITIAL_EB_STRUCTURE,
  changeEbMemberDepartment,
  groupEbByDepartment,
  moveEbDepartmentOrder,
  moveEbMemberOrderInDepartment,
  normalizeEbDepartmentRows,
  normalizeEbMemberRows,
  validateEbDepartmentInput,
  validateEbMemberInput
} from './executiveBoardLogic';

test('INITIAL_EB_STRUCTURE contains all 13 departments and all 37 unique entries verbatim', () => {
  assert.equal(INITIAL_EB_STRUCTURE.length, 13);
  assert.equal(DEFAULT_EB_DEPARTMENTS.length, 13);
  assert.equal(DEFAULT_EB_MEMBERS.length, 37);

  const expectedOrder = [
    'Secretariat',
    'Logistics',
    'Media / Press',
    'Security',
    'Senior Advisors',
    'Volunteers',
    'Human Resources',
    'Design',
    'IT',
    'Marketing',
    'Ceremonies',
    'DCC',
    'PR'
  ];
  assert.deepEqual(
    DEFAULT_EB_DEPARTMENTS.map((d) => d.name),
    expectedOrder
  );

  // Verify every named member appears exactly once
  const nameKeys = DEFAULT_EB_MEMBERS.map((m) => m.full_name.trim().toLowerCase());
  assert.equal(new Set(nameKeys).size, 37);

  // Verify exact spelling & role details called out in prompt
  const findMember = (name: string) => DEFAULT_EB_MEMBERS.find((m) => m.full_name === name);
  assert.equal(findMember('Laila Mohammad')?.role, 'Secretary General (SG)');
  assert.equal(findMember('Laya')?.role, 'Deputy Secretary General (DSG)');
  assert.equal(findMember('Zain Rawa sheda')?.role, 'Under-Secretary General (USG)');
  assert.equal(findMember('Ahmad El Amir')?.role, 'Logistics');
  assert.equal(findMember('Amal Houalla')?.role, 'Co-Female Head');
  assert.equal(findMember('Ahmed Magdi')?.role, 'Co-Head');
  assert.equal(findMember('Lily Rabia')?.role, 'Head');
});

test('groupEbByDepartment respects sort_order and omits empty departments on public view unless includeEmpty', () => {
  const depts = [
    { id: 'd2', name: 'IT', sort_order: 1 },
    { id: 'd1', name: 'Secretariat', sort_order: 0 },
    { id: 'd3', name: 'Empty Dept', sort_order: 2 }
  ];
  const members = [
    { id: 'm2', department_id: 'd2', full_name: 'Ahmed Magdi', role: 'Co-Head', sort_order: 1 },
    { id: 'm1', department_id: 'd2', full_name: 'Mohammed Magdi', role: 'Head', sort_order: 0 },
    { id: 'm0', department_id: 'd1', full_name: 'Laila Mohammad', role: 'Secretary General (SG)', sort_order: 0 }
  ];

  const publicGroups = groupEbByDepartment(depts, members);
  assert.equal(publicGroups.length, 2);
  assert.equal(publicGroups[0].department.name, 'Secretariat');
  assert.equal(publicGroups[1].department.name, 'IT');
  assert.deepEqual(
    publicGroups[1].members.map((m) => m.full_name),
    ['Mohammed Magdi', 'Ahmed Magdi']
  );

  const adminGroups = groupEbByDepartment(depts, members, { includeEmpty: true });
  assert.equal(adminGroups.length, 3);
  assert.equal(adminGroups[2].members.length, 0);
});

test('normalizeEbMemberRows strips any accidental email, phone, or photo fields', () => {
  const rows = normalizeEbMemberRows([
    {
      id: 'm1',
      department_id: 'd1',
      full_name: 'Laila Mohammad',
      role: 'Secretary General (SG)',
      sort_order: 0,
      email: 'secret@example.com',
      phone: '123456',
      photo_url: 'https://example.com/p.jpg'
    }
  ]);
  assert.equal(rows.length, 1);
  assert.equal('email' in rows[0], false);
  assert.equal('phone' in rows[0], false);
  assert.equal('photo_url' in rows[0], false);
});

test('moveEbDepartmentOrder and moveEbMemberOrderInDepartment reorder cleanly', () => {
  const reorderedDepts = moveEbDepartmentOrder(DEFAULT_EB_DEPARTMENTS, 'dept-logistics', 'up');
  assert.equal(reorderedDepts[0].name, 'Logistics');
  assert.equal(reorderedDepts[1].name, 'Secretariat');
  assert.equal(reorderedDepts[0].sort_order, 0);
  assert.equal(reorderedDepts[1].sort_order, 1);

  const reorderedMembers = moveEbMemberOrderInDepartment(DEFAULT_EB_MEMBERS, 'member-it-2', 'up');
  const itMembers = reorderedMembers
    .filter((m) => m.department_id === 'dept-it')
    .sort((a, b) => a.sort_order - b.sort_order);
  assert.deepEqual(
    itMembers.map((m) => m.full_name),
    ['Ahmed Magdi', 'Mohammed Magdi', 'Saleh Samaha']
  );
});

test('changeEbMemberDepartment moves member to new department and reindexes both departments', () => {
  const moved = changeEbMemberDepartment(DEFAULT_EB_MEMBERS, 'member-it-2', 'dept-pr');
  const prMembers = moved
    .filter((m) => m.department_id === 'dept-pr')
    .sort((a, b) => a.sort_order - b.sort_order);
  const itMembers = moved
    .filter((m) => m.department_id === 'dept-it')
    .sort((a, b) => a.sort_order - b.sort_order);

  assert.deepEqual(
    prMembers.map((m) => m.full_name),
    ['Lily Rabia', 'Ahmed Magdi']
  );
  assert.deepEqual(
    itMembers.map((m) => m.full_name),
    ['Mohammed Magdi', 'Saleh Samaha']
  );
  assert.deepEqual(
    itMembers.map((m) => m.sort_order),
    [0, 1]
  );
});

test('validation and normalization reject empty or invalid inputs', () => {
  assert.equal(validateEbDepartmentInput({ name: '   ' }), 'Department name is required.');
  assert.equal(validateEbDepartmentInput({ name: 'IT' }), null);

  assert.equal(
    validateEbMemberInput({ full_name: '', role: 'Head', department_id: 'd1' }),
    'Member full name is required.'
  );
  assert.equal(
    validateEbMemberInput({ full_name: 'Ahmed', role: '', department_id: 'd1' }),
    'Member role is required.'
  );
  assert.equal(
    validateEbMemberInput({ full_name: 'Ahmed', role: 'Head', department_id: '' }),
    'Please select a department.'
  );
  assert.equal(
    validateEbMemberInput({ full_name: 'Ahmed', role: 'Head', department_id: 'd1' }),
    null
  );

  assert.equal(normalizeEbDepartmentRows([{ id: 'x', name: '  ' }]).length, 0);
});
