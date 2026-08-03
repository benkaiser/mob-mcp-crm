// Hand-mirrored types for the Mob internal JSON API (/web/api/*).
// NOTE: there is no shared module across the build boundary — these mirror
// server shapes (src/server/web-api/*, src/services/contacts.ts) by hand.

// ─── Response envelopes ─────────────────────────────────────────

/** Pagination metadata returned alongside list responses. */
export interface PageMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** Success envelope: `{ data, meta? }`. */
export interface ApiEnvelope<T> {
  data: T;
  meta?: PageMeta;
}

/** Error envelope: `{ error: { code, message, details? } }`. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Unwrapped result returned by the client: data plus optional meta. */
export interface ApiResult<T> {
  data: T;
  meta?: PageMeta;
}

// ─── /me payload ─────────────��──────────────────────────────────

export interface MeEntitlements {
  contact_cap: number | null;
  public_api: boolean;
  webhooks: boolean;
  advanced_import: boolean;
}

export interface MeUsage {
  contacts: number;
  contact_cap: number | null;
}

export interface Me {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  pending_email: string | null;
  timezone: string;
  plan: string;
  hosted: boolean;
  /** True on the hosted beta deployment (server ENV=production). */
  beta?: boolean;
  usage: MeUsage;
  entitlements: MeEntitlements;
}

// ─── Contact (mirrors src/services/contacts.ts Contact) ─────────

export interface Contact {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  maiden_name: string | null;
  gender: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  birthday_mode: 'full_date' | 'month_day' | 'approximate_age' | null;
  birthday_date: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  birthday_year_approximate: number | null;
  status: 'active' | 'archived' | 'deceased';
  deceased_date: string | null;
  is_favorite: boolean;
  met_at_date: string | null;
  met_at_location: string | null;
  met_through_contact_id: string | null;
  met_description: string | null;
  job_title: string | null;
  company: string | null;
  industry: string | null;
  work_notes: string | null;
  is_me: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Computed
  age?: number | null;
  age_approximate?: boolean;
  birthday_display?: string | null;
}

// ─── Contact sub-entities ───────────────────────────────────────

export type ContactMethodType = string;

export interface ContactMethod {
  id: string;
  contact_id: string;
  type: ContactMethodType;
  value: string;
  label: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  contact_id: string;
  label: string | null;
  street_line_1: string | null;
  street_line_2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomField {
  id: string;
  contact_id: string;
  field_name: string;
  field_value: string;
  field_group: string | null;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  contact_id: string;
  related_contact_id: string;
  relationship_type: string;
  notes: string | null;
  contact_name?: string;
  related_contact_name?: string;
  created_at: string;
  updated_at: string;
}


export interface ContactMethodTypeConfig {
  id: string;
  user_id: string;
  key: string;
  label: string;
  link_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactMethodTypeOption {
  id: string | null;
  key: string;
  label: string;
  link_template: string | null;
  default_link_template: string | null;
  source: 'built-in' | 'custom' | 'override';
  is_built_in: boolean;
}

export interface RelationshipTypeOption {
  value: string;
  label: string;
  inverse_value: string;
  category: string;
  source: 'canonical' | 'custom';
}

export interface CustomRelationshipType {
  id: string;
  user_id: string;
  value: string;
  label: string | null;
  inverse_value: string;
  created_at: string;
  updated_at: string;
}

export interface FoodPreferences {
  id: string;
  contact_id: string;
  dietary_restrictions: string[];
  allergies: string[];
  favorite_foods: string[];
  disliked_foods: string[];
  notes: string | null;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Note {
  id: string;
  contact_id: string;
  title: string | null;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  contact_name?: string;
  body_truncated?: boolean;
}

export interface Activity {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  description: string | null;
  occurred_at: string;
  duration_minutes: number | null;
  location: string | null;
  created_at: string;
  updated_at: string;
  participants?: string[];
}

export interface LifeEvent {
  id: string;
  contact_id: string;
  event_type: string;
  title: string;
  description: string | null;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  contact_id: string;
  title: string;
  description: string | null;
  reminder_date: string;
  frequency: string;
  status: string;
  is_auto_generated?: boolean;
}

export interface Task {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string;
  status: string;
}

export interface Gift {
  id: string;
  contact_id: string;
  name: string;
  description: string | null;
  url: string | null;
  estimated_cost: number | null;
  currency: string;
  occasion: string | null;
  status: string;
  direction: string;
  date: string | null;
}

export interface Debt {
  id: string;
  contact_id: string;
  amount: number;
  currency: string;
  direction: string;
  reason: string | null;
  incurred_at: string | null;
  settled_at: string | null;
  status: string;
}

export interface DebtSummary {
  contact_id: string;
  total_i_owe: number;
  total_they_owe: number;
  net_balance: number;
  currency: string;
}

/** The enriched contact profile returned by GET /web/api/contacts/:id. */
export interface ContactProfile extends Contact {
  contact_methods: ContactMethod[];
  addresses: Address[];
  food_preferences: FoodPreferences | null;
  custom_fields: CustomField[];
  tags: Tag[];
  relationships: Relationship[];
  recent_notes: Note[];
  recent_activities: Activity[];
  life_events: LifeEvent[];
  active_reminders: Reminder[];
  open_tasks: Task[];
  recent_gifts: Gift[];
  active_debts: Debt[];
  debt_summary: DebtSummary[];
}

/** A generic paginated list payload (data array + meta). */
export interface PaginatedList<T> {
  data: T[];
  meta: PageMeta;
}

// ─── Dashboard payload ──────────────────────────────────────────

export interface UpcomingReminder {
  id: string;
  title: string;
  description: string | null;
  reminder_date: string;
  frequency: string;
  status: string;
  is_overdue: boolean;
  days_until: number;
  contact_id: string;
  contact_name: string;
}

export interface UpcomingBirthday {
  contact_id: string;
  contact_name: string;
  birthday_display: string | null;
  birthday_date: string | null;
  birthday_mode: string;
  age_turning: number | null;
  days_until: number;
  is_today: boolean;
}

export interface DebtByCurrency {
  currency: string;
  total_i_owe: number;
  total_they_owe: number;
  net_balance: number;
}

export interface DashboardCounts {
  contacts: number;
  active_contacts: number;
  favorite_contacts: number;
  total_activities: number;
  total_notes: number;
  pending_reminders: number;
  pending_tasks: number;
  active_debts: number;
  gift_ideas: number;
}

export interface AuditStreakDay {
  date: string;
  active: boolean;
}

export interface AuditStreak {
  days: AuditStreakDay[];
  current_streak: number;
}

export interface DashboardData {
  upcoming_reminders: UpcomingReminder[];
  upcoming_birthdays: UpcomingBirthday[];
  recent_activities: Activity[];
  open_tasks: Task[];
  debt_summary: { by_currency: DebtByCurrency[]; active_count: number };
  counts: DashboardCounts;
  streak: AuditStreak;
}

// ─── Audit log payload ───────────────────────────────────────────

export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

// ─── Search payload ─────────────────────────────────────────────

export type SearchEntityType =
  | 'contacts' | 'notes' | 'activities' | 'life_events' | 'gifts' | 'tasks'
  | 'reminders' | 'debts' | 'relationships' | 'contact_methods' | 'addresses' | 'custom_fields';

export interface SearchResult {
  id: string;
  entity_type: SearchEntityType;
  title: string;
  snippet: string;
  contact_id?: string;
  contact_name?: string;
  date?: string;
  match_field?: string;
}

export interface GlobalSearchResult {
  results: Record<SearchEntityType, SearchResult[]>;
  total_matches: number;
}

// ─── Export / statistics ────────────────────────────────────────

export interface CrmStatistics {
  total_contacts: number;
  active_contacts: number;
  archived_contacts: number;
  favorite_contacts: number;
  total_activities: number;
  total_notes: number;
  total_life_events: number;
  total_relationships: number;
  pending_reminders: number;
  active_debts: number;
  pending_tasks: number;
  gift_ideas: number;
  tags_count: number;
  contacts_by_company: { company: string; count: number }[];
}

// ─── Import payload ─────────────────────────────────────────────

export interface ImportSummary {
  created: number;
  skipped_duplicate: number;
  skipped_quota: number;
  warnings: string[];
  per_entity: {
    contacts: number;
    methods: number;
    addresses: number;
    notes: number;
    tags: number;
  };
}

export interface ImportPreview {
  records: unknown[];
  count: number;
}

/** Result of a destructive Monica CRM SQL import (per-entity counts). */
export interface MonicaImportResult {
  contacts: number;
  tags: number;
  contactMethods: number;
  notes: number;
  activities: number;
  relationships: number;
  addresses: number;
  lifeEvents: number;
  gifts: number;
  reminders: number;
  skipped_birthday_reminders: number;
  calls: number;
  errors: string[];
}

// ─── Duplicates ─────────────────────────────────────────────────

export interface DuplicatePair {
  contact_id_1: string;
  contact_name_1: string;
  contact_id_2: string;
  contact_name_2: string;
  reason: string;
}
