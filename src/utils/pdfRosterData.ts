export type RosterAccountRole = 'member' | 'head' | 'advisor' | 'admin';

export interface OfficialPdfRosterEntry {
  full_name: string;
  email: string | null;
  phone: string;
  department: string;
  position: string;
  intended_role: RosterAccountRole;
  page: 1 | 2 | 3;
}

export interface RosterEntryLike {
  id: string;
  full_name: string;
  email: string | null;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  active?: boolean | null;
  account_role?: string | null;
}

export interface ProfileLinkLike {
  id: string;
  roster_id?: string | null;
  email?: string | null;
  role?: string | null;
  active?: boolean | null;
}

export type RosterRegistrationStatus = 'registered' | 'pending' | 'incomplete';

export const OFFICIAL_PDF_ROSTER: readonly OfficialPdfRosterEntry[] = [
  // Page 1 — SECRETARIES
  {
    full_name: 'Laila Mohammad',
    email: 'sarasamisara091@gmail.com',
    phone: '966 57 764 9746',
    department: 'Secretaries',
    position: 'SG',
    intended_role: 'admin',
    page: 1
  },
  {
    full_name: 'Laya',
    email: 'lshawan@icloud.com',
    phone: '966 53 309 9462',
    department: 'Secretaries',
    position: 'DSG',
    intended_role: 'admin',
    page: 1
  },
  {
    full_name: 'zain rawasheda',
    email: null,
    phone: '966 53 374 9188',
    department: 'Secretaries',
    position: 'USG',
    intended_role: 'admin',
    page: 1
  },

  // Page 1 — LOGISTICS
  {
    full_name: 'Ahmad El Amir',
    email: 'elamir868@gmail.com',
    phone: '966 57 167 2294',
    department: 'Logistics',
    position: 'Member',
    intended_role: 'member',
    page: 1
  },

  // Page 1 — MEDIA/PRESS
  {
    full_name: 'Dana Al Najjar',
    email: 'danaissuperr@gmail.com',
    phone: '966 55 247 7915',
    department: 'Media/Press',
    position: 'Female Head',
    intended_role: 'head',
    page: 1
  },
  {
    full_name: 'Najla Rami',
    email: 'spamzjuju1@gmail.com',
    phone: '966 50 742 8574',
    department: 'Media/Press',
    position: 'Co-head',
    intended_role: 'head',
    page: 1
  },
  {
    full_name: 'Yassin El nahas',
    email: 'squadepubg@gmail.com',
    phone: '966 56 340 4988',
    department: 'Media/Press',
    position: 'Male Head',
    intended_role: 'head',
    page: 1
  },

  // Page 1 — SECURITY
  {
    full_name: 'karma mohammed',
    email: 'karmamohamed71@gmail.com',
    phone: '966 54 973 5818',
    department: 'Security',
    position: 'Female Head',
    intended_role: 'head',
    page: 1
  },
  {
    full_name: 'Amal Houalla',
    email: 'amoulehoualla@gmail.com',
    phone: '966 56 027 8271',
    department: 'Security',
    position: 'Co Female Head',
    intended_role: 'head',
    page: 1
  },
  {
    full_name: 'Ali Al Ani',
    email: 'al00sh71010@gmail.com',
    phone: '966 53 660 0227',
    department: 'Security',
    position: 'Male Head',
    intended_role: 'head',
    page: 1
  },

  // Page 1 — SENIOR ADVISORS
  {
    full_name: 'Meshal alqahtani',
    email: null,
    phone: '966 53 610 9071',
    department: 'Senior Advisors',
    position: 'Senior Advisor',
    intended_role: 'advisor',
    page: 1
  },
  {
    full_name: 'Malak awad',
    email: 'm2011r2013@gmail.com',
    phone: '966 54 992 6103',
    department: 'Senior Advisors',
    position: 'Senior Advisor',
    intended_role: 'advisor',
    page: 1
  },

  // Page 1 — VOLUNTEERS
  {
    full_name: 'Khalid Ibrahim Almahini',
    email: 'khalidfly2010@gmail.com',
    phone: '966 55 461 1223',
    department: 'Volunteers',
    position: 'Male Head',
    intended_role: 'head',
    page: 1
  },
  {
    full_name: 'Juana Hamdan',
    email: 'juanahamdan130@gmail.com',
    phone: '966 50 877 3483',
    department: 'Volunteers',
    position: 'Female Head',
    intended_role: 'head',
    page: 1
  },
  {
    full_name: 'Thalia barakat',
    email: 't3624641@gmail.com',
    phone: '966 54 784 6997',
    department: 'Volunteers',
    position: 'Co-head',
    intended_role: 'head',
    page: 1
  },

  // Page 1 & Page 2 — HUMAN RESOURCES
  {
    full_name: 'Rodina Mostafa',
    email: 'rodinasabrie@gmail.com',
    phone: '966 57 030 2576',
    department: 'Human Resources',
    position: 'Head',
    intended_role: 'head',
    page: 1
  },
  {
    full_name: 'Adam Abu ghalwa',
    email: 'adghalwa@gmail.com',
    phone: '966 53 950 4476',
    department: 'Human Resources',
    position: 'Head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'Talia Almuhtadi',
    email: 'tjmuhtadi@gmail.com',
    phone: '966 59 013 8731',
    department: 'Human Resources',
    position: 'Co-head',
    intended_role: 'head',
    page: 2
  },

  // Page 2 — DESIGN
  {
    full_name: 'Layan Ahmed',
    email: 'layanelsayed8211@gmail.com',
    phone: '966 53 967 0620',
    department: 'Design',
    position: 'Head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'Saud Alanzi',
    email: 'saudps11@gmail.com',
    phone: '966 59 123 4282',
    department: 'Design',
    position: 'Head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'Helen manal sadi',
    email: 'helenmanalsadi@gmail.com',
    phone: '+966 55 219 0666',
    department: 'Design',
    position: 'Co-head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'Adel Naimi',
    email: 'adel.naimi2010@gmail.com',
    phone: '+966 56 546 7990',
    department: 'Design',
    position: 'Co-head',
    intended_role: 'head',
    page: 2
  },

  // Page 2 — IT
  {
    full_name: 'Mohammed Magdi',
    email: 'diavlo3444@gmail.com',
    phone: '966 55 879 2450',
    department: 'IT',
    position: 'Head',
    intended_role: 'admin',
    page: 2
  },
  {
    full_name: 'Ahmed Magdi',
    email: 'ahmedmagdilkik@gmail.com',
    phone: '966 55 879 2598',
    department: 'IT',
    position: 'Co-head',
    intended_role: 'admin',
    page: 2
  },
  {
    full_name: 'Saleh samaha',
    email: 'sam7awee2010@gmail.com',
    phone: '966 57 270 6287',
    department: 'IT',
    position: 'Head',
    intended_role: 'admin',
    page: 2
  },

  // Page 2 — MARKETING
  {
    full_name: 'Naya Barakat',
    email: 'naya44361@gmail.com',
    phone: '966 54 785 9918',
    department: 'Marketing',
    position: 'Head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'Mohammed el Nahas',
    email: 'mamrsabry@gmail.com',
    phone: '+966 54 807 1438',
    department: 'Marketing',
    position: 'Member',
    intended_role: 'member',
    page: 2
  },
  {
    full_name: 'Adam Abu Taleb',
    email: null,
    phone: '966 54 652 1051',
    department: 'Marketing',
    position: 'Member',
    intended_role: 'member',
    page: 2
  },
  {
    full_name: 'Ahmed Tamer El sayed',
    email: 'elsayad.ahmed894@gmail.com',
    phone: '+966 56 514 1120',
    department: 'Marketing',
    position: 'Member',
    intended_role: 'member',
    page: 2
  },
  {
    full_name: 'Rital Marwan Dahdal',
    email: 'ritaldahdal27@gmail.com',
    phone: '+966 50 945 8482',
    department: 'Marketing',
    position: 'Member',
    intended_role: 'member',
    page: 2
  },
  {
    full_name: 'Mostafa mahmoud abdou',
    email: 'brentcatsabdou2009@gmail.com',
    phone: '+966 50 351 2461',
    department: 'Marketing',
    position: 'Member',
    intended_role: 'member',
    page: 2
  },

  // Page 2 — CEREMONIES
  {
    full_name: 'Aiten mohamed',
    email: 'aiten6840@gmail.com',
    phone: '966 54 373 1910',
    department: 'Ceremonies',
    position: 'Co-head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'Ghalyah Alabduldayem',
    email: 'ghdayem22@gmail.com',
    phone: '966 50 222 2999',
    department: 'Ceremonies',
    position: 'Head',
    intended_role: 'head',
    page: 2
  },

  // Page 2 — DCC
  {
    full_name: 'Leen Obeidat',
    email: 'obeleen304@gmail.com',
    phone: '966 59 109 0220',
    department: 'DCC',
    position: 'Head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'Majd Alnajjar',
    email: 'majdalnajjar2009@gmail.com',
    phone: '966 50 342 9131',
    department: 'DCC',
    position: 'Co-head',
    intended_role: 'head',
    page: 2
  },
  {
    full_name: 'rakan samer',
    email: 'ok.rakan.albaba@gmail.com',
    phone: '+966 56 441 2345',
    department: 'DCC',
    position: 'Co-head',
    intended_role: 'head',
    page: 2
  },

  // Page 3 — PR
  {
    full_name: 'lily rabia',
    email: null,
    phone: '+966 59 930 6323',
    department: 'PR',
    position: 'Head',
    intended_role: 'head',
    page: 3
  }
];

export const PDF_DEPARTMENTS: readonly string[] = [
  'Secretaries',
  'Logistics',
  'Media/Press',
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

export function normalizeNullableEmail(email: string | null | undefined): string | null {
  const cleaned = (email || '').trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

export function isValidNullableEmail(email: string | null | undefined): boolean {
  const normalized = normalizeNullableEmail(email);
  if (!normalized) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized);
}

export function resolveRosterAccountRole(
  department: string | null | undefined,
  position: string | null | undefined,
  explicitRole?: string | null
): RosterAccountRole {
  const explicit = (explicitRole || '').trim().toLowerCase();
  if (explicit === 'admin' || explicit === 'head' || explicit === 'advisor' || explicit === 'member') {
    return explicit;
  }

  const dept = (department || '').trim().toLowerCase();
  const pos = (position || '').trim().toLowerCase();

  if (dept === 'secretaries' || dept === 'secretariat') {
    return 'admin';
  }

  if (
    dept === 'it' ||
    dept === 'information technology'
  ) {
    if (pos.includes('head') || pos.includes('admin')) {
      return 'admin';
    }
    return 'member';
  }

  if (dept.includes('senior advisor') || dept === 'advisors' || pos.includes('advisor')) {
    return 'advisor';
  }

  if (pos.includes('head') || pos === 'sg' || pos === 'dsg' || pos === 'usg') {
    return 'head';
  }

  return 'member';
}

export function isRosterEntryActive(entry: Pick<RosterEntryLike, 'active'>): boolean {
  return entry.active !== false;
}

export function getRosterRegistrationStatus(
  entry: Pick<RosterEntryLike, 'id' | 'email'>,
  profiles: readonly ProfileLinkLike[]
): RosterRegistrationStatus {
  const normEmail = normalizeNullableEmail(entry.email);
  const linked = profiles.some(
    p =>
      (p.roster_id && p.roster_id === entry.id) ||
      (normEmail !== null && normalizeNullableEmail(p.email) === normEmail)
  );
  if (linked) return 'registered';
  if (!normEmail) return 'incomplete';
  return 'pending';
}

export function findLinkedProfileForRoster<T extends ProfileLinkLike>(
  entry: Pick<RosterEntryLike, 'id' | 'email'>,
  profiles: readonly T[]
): T | null {
  const normEmail = normalizeNullableEmail(entry.email);
  return (
    profiles.find(
      p =>
        (p.roster_id && p.roster_id === entry.id) ||
        (normEmail !== null && normalizeNullableEmail(p.email) === normEmail)
    ) ?? null
  );
}

export function planPdfRosterSync(
  existingRoster: readonly Pick<RosterEntryLike, 'full_name' | 'email' | 'department'>[],
  sourceEntries: readonly OfficialPdfRosterEntry[] = OFFICIAL_PDF_ROSTER
): {
  toInsertWithEmail: OfficialPdfRosterEntry[];
  toInsertMissingEmail: OfficialPdfRosterEntry[];
  alreadyPresentCount: number;
} {
  const existingEmails = new Set(
    existingRoster
      .map(r => normalizeNullableEmail(r.email))
      .filter((e): e is string => e !== null)
  );
  const existingIncompleteKeys = new Set(
    existingRoster
      .filter(r => normalizeNullableEmail(r.email) === null)
      .map(r => `${r.full_name.trim().toLowerCase()}::${(r.department || '').trim().toLowerCase()}`)
  );

  const toInsertWithEmail: OfficialPdfRosterEntry[] = [];
  const toInsertMissingEmail: OfficialPdfRosterEntry[] = [];
  let alreadyPresentCount = 0;

  for (const item of sourceEntries) {
    const email = normalizeNullableEmail(item.email);
    if (email) {
      if (existingEmails.has(email)) {
        alreadyPresentCount++;
      } else {
        existingEmails.add(email);
        toInsertWithEmail.push({ ...item, email });
      }
    } else {
      const key = `${item.full_name.trim().toLowerCase()}::${item.department.trim().toLowerCase()}`;
      if (existingIncompleteKeys.has(key)) {
        alreadyPresentCount++;
      } else {
        existingIncompleteKeys.add(key);
        toInsertMissingEmail.push(item);
      }
    }
  }

  return {
    toInsertWithEmail,
    toInsertMissingEmail,
    alreadyPresentCount
  };
}

export function summarizeOfficialPdfRoster(entries: readonly OfficialPdfRosterEntry[] = OFFICIAL_PDF_ROSTER) {
  const withEmail = entries.filter(e => normalizeNullableEmail(e.email) !== null);
  const missingEmail = entries.filter(e => normalizeNullableEmail(e.email) === null);
  const departments = Array.from(new Set(entries.map(e => e.department)));

  return {
    totalPeople: entries.length,
    validEmailCount: withEmail.length,
    missingEmailCount: missingEmail.length,
    missingEmailNames: missingEmail.map(e => ({
      full_name: e.full_name,
      department: e.department,
      position: e.position
    })),
    departmentCount: departments.length,
    departments
  };
}
