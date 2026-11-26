import type { ApplicationSettings } from '../utils/committeesAndSettingsLogic';

export type UserRole = 'member' | 'head' | 'advisor' | 'admin';

export type AnnouncementAudience = 'all' | 'department' | 'heads';

export interface RosterRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  department: string;
  position: string;
  notes: string;
  active?: boolean;
  account_role?: UserRole;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  roster_id: string | null;
  email: string;
  full_name: string;
  department: string;
  position: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface HeroContent {
  title: string;
  tagline: string;
  ctaLabel: string;
}

export interface AboutContent {
  paragraphs: string[];
}

export interface CommitteeItem {
  name: string;
  details: string;
}

export interface ScheduleItem {
  dateTime: string;
  title: string;
  details?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface RegisterItem {
  title: string;
  details: string;
  linkUrl?: string;
  linkLabel?: string;
}

export interface TbaSectionContent<T> {
  showTba: boolean;
  tbaSubtitle: string;
  items: T[];
}

export interface SiteSettings {
  site_name: string;
  registration_open: boolean;
  contact_email: string;
}

export interface FullSiteContent {
  hero: HeroContent;
  about: AboutContent;
  committees: TbaSectionContent<CommitteeItem>;
  schedule: TbaSectionContent<ScheduleItem>;
  faq: TbaSectionContent<FaqItem>;
  register: TbaSectionContent<RegisterItem>;
  settings: SiteSettings;
  application_settings?: ApplicationSettings;
}

export interface TeamCardRow {
  id: string;
  full_name: string;
  title: string;
  photo_url: string;
  sort_order: number;
  visible: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_email: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  target_department: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EbDepartmentRow {
  id: string;
  name: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface EbMemberRow {
  id: string;
  department_id: string;
  full_name: string;
  role: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

