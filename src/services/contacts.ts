import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

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

export interface CreateContactInput {
  first_name: string;
  last_name?: string;
  nickname?: string;
  maiden_name?: string;
  gender?: string;
  pronouns?: string;
  avatar_url?: string;
  birthday_mode?: 'full_date' | 'month_day' | 'approximate_age';
  birthday_date?: string;
  birthday_month?: number;
  birthday_day?: number;
  birthday_year_approximate?: number;
  status?: 'active' | 'archived' | 'deceased';
  deceased_date?: string;
  is_favorite?: boolean;
  met_at_date?: string;
  met_at_location?: string;
  met_through_contact_id?: string;
  met_description?: string;
  job_title?: string;
  company?: string;
  industry?: string;
  work_notes?: string;
}

export type UpdateContactInput = Partial<CreateContactInput>;

export interface ListContactsOptions {
  page?: number;
  per_page?: number;
  status?: 'active' | 'archived' | 'deceased';
  is_favorite?: boolean;
  search?: string;
  company?: string;
  tag_name?: string;
  sort_by?: 'name' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
  include_deleted?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Birthday Helpers ───────────────────────────────────────────

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Generate a human-readable birthday description that clarifies the precision.
 * This is included in MCP responses so the LLM understands what is actually known.
 */
export function formatBirthdayDisplay(contact: {
  birthday_mode: string | null;
  birthday_date: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  birthday_year_approximate: number | null;
}): string | null {
  if (!contact.birthday_mode) return null;

  if (contact.birthday_mode === 'full_date' && contact.birthday_date) {
    return contact.birthday_date;
  }

  if (contact.birthday_mode === 'month_day' && contact.birthday_month && contact.birthday_day) {
    const monthName = MONTH_NAMES[contact.birthday_month - 1] ?? `Month ${contact.birthday_month}`;
    return `${monthName} ${contact.birthday_day} (year unknown)`;
  }

  if (contact.birthday_mode === 'approximate_age' && contact.birthday_year_approximate) {
    return `Approximately born in ${contact.birthday_year_approximate} (exact date unknown)`;
  }

  return null;
}

/**
 * Calculate age from birthday information.
 * Returns { age, approximate } or null if no year information available.
 */
export function calculateAge(contact: {
  birthday_mode: string | null;
  birthday_date: string | null;
  birthday_year_approximate: number | null;
}): { age: number; approximate: boolean } | null {
  const now = new Date();
  let birthYear: number;
  let birthMonth = 0;
  let birthDay = 1;
  let approximate = false;

  if (contact.birthday_mode === 'full_date' && contact.birthday_date) {
    const parts = contact.birthday_date.split('-');
    birthYear = parseInt(parts[0], 10);
    birthMonth = parseInt(parts[1], 10) - 1;
    birthDay = parseInt(parts[2], 10);
  } else if (contact.birthday_mode === 'approximate_age' && contact.birthday_year_approximate) {
    birthYear = contact.birthday_year_approximate;
    approximate = true;
  } else {
    return null;
  }

  let age = now.getFullYear() - birthYear;
  if (!approximate) {
    const birthdayThisYear = new Date(now.getFullYear(), birthMonth, birthDay);
    if (now < birthdayThisYear) {
      age--;
    }
  }

  return { age, approximate };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Auto-populate birthday_month and birthday_day from birthday_date when mode is full_date.
 * This ensures getUpcomingBirthdays can find contacts regardless of whether month/day
 * were explicitly provided.
 */
function normalizeBirthdayFields<T extends {
  birthday_mode?: string | null;
  birthday_date?: string | null;
  birthday_month?: number | null;
  birthday_day?: number | null;
}>(input: T): T {
  if (input.birthday_mode === 'full_date' && input.birthday_date) {
    const parts = input.birthday_date.split('-');
    if (parts.length >= 3) {
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(month) && !isNaN(day)) {
        return {
          ...input,
          birthday_month: input.birthday_month ?? month,
          birthday_day: input.birthday_day ?? day,
        };
      }
    }
  }
  return input;
}

// ─── Service ────────────────────────────────────────────────────

export class ContactService {
  constructor(private db: Database.Database) {}

  create(userId: string, input: CreateContactInput): Contact {
    const id = generateId();
    const now = new Date().toISOString();

    // Auto-populate birthday_month/birthday_day from birthday_date for full_date mode
    const normalizedInput = normalizeBirthdayFields(input);

    this.db.prepare(`
      INSERT INTO contacts (
        id, user_id, first_name, last_name, nickname, maiden_name,
        gender, pronouns, avatar_url,
        birthday_mode, birthday_date, birthday_month, birthday_day, birthday_year_approximate,
        status, deceased_date, is_favorite,
        met_at_date, met_at_location, met_through_contact_id, met_description,
        job_title, company, industry, work_notes,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      id, userId, normalizedInput.first_name, normalizedInput.last_name ?? null, normalizedInput.nickname ?? null, normalizedInput.maiden_name ?? null,
      normalizedInput.gender ?? null, normalizedInput.pronouns ?? null, normalizedInput.avatar_url ?? null,
      normalizedInput.birthday_mode ?? null, normalizedInput.birthday_date ?? null, normalizedInput.birthday_month ?? null, normalizedInput.birthday_day ?? null, normalizedInput.birthday_year_approximate ?? null,
      normalizedInput.status ?? 'active', normalizedInput.deceased_date ?? null, normalizedInput.is_favorite ? 1 : 0,
      normalizedInput.met_at_date ?? null, normalizedInput.met_at_location ?? null, normalizedInput.met_through_contact_id ?? null, normalizedInput.met_description ?? null,
      normalizedInput.job_title ?? null, normalizedInput.company ?? null, normalizedInput.industry ?? null, normalizedInput.work_notes ?? null,
      now, now,
    );

    return this.get(userId, id)!;
  }

  get(userId: string, contactId: string): Contact | null {
    const row = this.db.prepare(`
      SELECT * FROM contacts
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).get(contactId, userId) as any;

    if (!row) return null;
    return this.mapRow(row);
  }

  update(userId: string, contactId: string, input: UpdateContactInput): Contact | null {
    const existing = this.get(userId, contactId);
    if (!existing) return null;

    // Normalize birthday fields: auto-populate month/day from birthday_date if needed.
    // Use the effective mode (from input or existing) and effective date (from input or existing)
    // but only add auto-populated fields to normalizedInput (not the effective mode/date themselves).
    const effectiveMode = input.birthday_mode ?? existing.birthday_mode ?? null;
    const effectiveDate = 'birthday_date' in input ? input.birthday_date : existing.birthday_date;
    const normalized = normalizeBirthdayFields({
      birthday_mode: effectiveMode,
      birthday_date: effectiveDate ?? null,
      birthday_month: input.birthday_month ?? null,
      birthday_day: input.birthday_day ?? null,
    });
    const normalizedInput: UpdateContactInput = { ...input };
    if (!('birthday_month' in input) && normalized.birthday_month != null) {
      normalizedInput.birthday_month = normalized.birthday_month;
    }
    if (!('birthday_day' in input) && normalized.birthday_day != null) {
      normalizedInput.birthday_day = normalized.birthday_day;
    }

    const fields: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
      first_name: 'first_name',
      last_name: 'last_name',
      nickname: 'nickname',
      maiden_name: 'maiden_name',
      gender: 'gender',
      pronouns: 'pronouns',
      avatar_url: 'avatar_url',
      birthday_mode: 'birthday_mode',
      birthday_date: 'birthday_date',
      birthday_month: 'birthday_month',
      birthday_day: 'birthday_day',
      birthday_year_approximate: 'birthday_year_approximate',
      status: 'status',
      deceased_date: 'deceased_date',
      is_favorite: 'is_favorite',
      met_at_date: 'met_at_date',
      met_at_location: 'met_at_location',
      met_through_contact_id: 'met_through_contact_id',
      met_description: 'met_description',
      job_title: 'job_title',
      company: 'company',
      industry: 'industry',
      work_notes: 'work_notes',
    };

    for (const [inputKey, dbColumn] of Object.entries(fieldMap)) {
      if (inputKey in normalizedInput) {
        fields.push(`${dbColumn} = ?`);
        let value = (normalizedInput as any)[inputKey];
        if (inputKey === 'is_favorite') {
          value = value ? 1 : 0;
        }
        values.push(value ?? null);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(contactId, userId);

    this.db.prepare(`
      UPDATE contacts
      SET ${fields.join(', ')}
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(...values);

    return this.get(userId, contactId);
  }

  softDelete(userId: string, contactId: string): boolean {
    // Check if this is a self-contact (is_me = 1) — cannot be deleted
    const contact = this.db.prepare(`
      SELECT is_me FROM contacts
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).get(contactId, userId) as { is_me: number } | undefined;

    if (contact && contact.is_me) {
      throw new Error('Cannot delete your own contact record');
    }

    const result = this.db.prepare(`
      UPDATE contacts
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(contactId, userId);

    return result.changes > 0;
  }

  restore(userId: string, contactId: string): Contact {
    const row = this.db.prepare(`
      SELECT * FROM contacts
      WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL
    `).get(contactId, userId) as any;

    if (!row) {
      throw new Error('Contact not found or not deleted');
    }

    this.db.prepare(`
      UPDATE contacts
      SET deleted_at = NULL, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(contactId, userId);

    return this.get(userId, contactId)!;
  }

  list(userId: string, options: ListContactsOptions = {}): PaginatedResult<Contact> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [userId];

    if (!options.include_deleted) {
      conditions.push('deleted_at IS NULL');
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.is_favorite !== undefined) {
      conditions.push('is_favorite = ?');
      params.push(options.is_favorite ? 1 : 0);
    }

    if (options.company) {
      conditions.push('company = ?');
      params.push(options.company);
    }

    if (options.search) {
      conditions.push(`(
        first_name LIKE ? OR
        last_name LIKE ? OR
        (first_name || ' ' || COALESCE(last_name, '')) LIKE ? OR
        nickname LIKE ? OR
        company LIKE ? OR
        job_title LIKE ?
      )`);
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (options.tag_name) {
      conditions.push('id IN (SELECT ct.contact_id FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id WHERE t.name = ?)');
      params.push(options.tag_name);
    }

    const whereClause = conditions.join(' AND ');

    // Sort
    let orderBy: string;
    const sortOrder = options.sort_order === 'desc' ? 'DESC' : 'ASC';
    switch (options.sort_by) {
      case 'created_at':
        orderBy = `created_at ${sortOrder}`;
        break;
      case 'updated_at':
        orderBy = `updated_at ${sortOrder}`;
        break;
      case 'name':
      default:
        orderBy = `COALESCE(last_name, '') ${sortOrder}, first_name ${sortOrder}`;
        break;
    }

    // Count total
    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM contacts WHERE ${whereClause}`
    ).get(...params) as any;

    // Fetch page
    const rows = this.db.prepare(
      `SELECT * FROM contacts WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    return {
      data: rows.map((row) => this.mapRow(row)),
      total: countResult.count,
      page,
      per_page: perPage,
    };
  }

  // ─── Cross-Contact Query Methods ──────────────────────────────

  /**
   * Find contacts the user hasn't interacted with recently.
   */
  getContactsNeedingAttention(userId: string, options: {
    days_since_last_interaction?: number;
    status?: 'active' | 'archived';
    tag_name?: string;
    is_favorite?: boolean;
    limit?: number;
  } = {}): {
    data: Array<{
      contact_id: string;
      contact_name: string;
      company: string | null;
      is_favorite: boolean;
      tags: string[];
      last_interaction_date: string | null;
      last_interaction_type: string | null;
      last_interaction_title: string | null;
      days_since_interaction: number;
      total_interactions: number;
    }>;
    total: number;
  } {
    const daysSince = options.days_since_last_interaction ?? 30;
    const status = options.status ?? 'active';
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const cutoffDate = new Date(Date.now() - daysSince * 86400000).toISOString();

    const conditions: string[] = [
      'c.user_id = ?',
      'c.deleted_at IS NULL',
      'c.status = ?',
      'c.is_me = 0',
    ];
    const params: any[] = [userId, status];

    if (options.is_favorite !== undefined) {
      conditions.push('c.is_favorite = ?');
      params.push(options.is_favorite ? 1 : 0);
    }

    let joinClause = '';
    if (options.tag_name) {
      joinClause = 'JOIN contact_tags ct ON c.id = ct.contact_id JOIN tags t ON ct.tag_id = t.id';
      conditions.push('t.name = ?');
      params.push(options.tag_name);
    }

    const whereClause = conditions.join(' AND ');

    // Get all eligible contacts with their last interaction info
    const rows = this.db.prepare(`
      SELECT
        c.id, c.first_name, c.last_name, c.company, c.is_favorite, c.created_at,
        MAX(a.occurred_at) as last_interaction_date,
        COUNT(DISTINCT a.id) as total_interactions
      FROM contacts c
      ${joinClause}
      LEFT JOIN activity_participants ap ON c.id = ap.contact_id
      LEFT JOIN activities a ON ap.activity_id = a.id AND a.deleted_at IS NULL
      WHERE ${whereClause}
      GROUP BY c.id
      HAVING last_interaction_date IS NULL OR last_interaction_date <= ?
      ORDER BY
        CASE WHEN last_interaction_date IS NULL THEN 0 ELSE 1 END,
        last_interaction_date ASC
      LIMIT ?
    `).all(...params, cutoffDate, limit) as any[];

    // For contacts with interactions, get the last interaction details
    const lastActivityStmt = this.db.prepare(`
      SELECT a.type, a.title
      FROM activities a
      JOIN activity_participants ap ON a.id = ap.activity_id
      WHERE ap.contact_id = ? AND a.deleted_at IS NULL
      ORDER BY a.occurred_at DESC
      LIMIT 1
    `);

    // Get tags for contacts
    const tagStmt = this.db.prepare(`
      SELECT t.name FROM tags t
      JOIN contact_tags ct ON t.id = ct.tag_id
      WHERE ct.contact_id = ?
    `);

    const now = Date.now();
    const data = rows.map((row) => {
      let lastType: string | null = null;
      let lastTitle: string | null = null;

      if (row.last_interaction_date) {
        const lastActivity = lastActivityStmt.get(row.id) as any;
        if (lastActivity) {
          lastType = lastActivity.type;
          lastTitle = lastActivity.title;
        }
      }

      const daysSinceInteraction = row.last_interaction_date
        ? Math.round((now - new Date(row.last_interaction_date).getTime()) / 86400000)
        : Math.round((now - new Date(row.created_at).getTime()) / 86400000);

      const tagRows = tagStmt.all(row.id) as any[];

      return {
        contact_id: row.id,
        contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
        company: row.company,
        is_favorite: Boolean(row.is_favorite),
        tags: tagRows.map((t) => t.name),
        last_interaction_date: row.last_interaction_date ?? null,
        last_interaction_type: lastType,
        last_interaction_title: lastTitle,
        days_since_interaction: daysSinceInteraction,
        total_interactions: row.total_interactions,
      };
    });

    return { data, total: data.length };
  }

  getUpcomingBirthdays(userId: string, options: {
    days_ahead?: number;
    month?: number;
  } = {}): {
    data: Array<{
      contact_id: string;
      contact_name: string;
      birthday_display: string | null;
      birthday_date: string | null;
      birthday_mode: string;
      age_turning: number | null;
      days_until: number;
      is_today: boolean;
    }>;
    total: number;
  } {
    const now = new Date();
    const todayMonth = now.getMonth() + 1; // 1-based
    const todayDay = now.getDate();
    const todayYear = now.getFullYear();

    // Get all contacts with birthday info
    const rows = this.db.prepare(`
      SELECT id, first_name, last_name,
        birthday_mode, birthday_date, birthday_month, birthday_day, birthday_year_approximate
      FROM contacts
      WHERE user_id = ? AND deleted_at IS NULL
        AND status != 'deceased'
        AND birthday_mode IS NOT NULL
        AND birthday_month IS NOT NULL
        AND birthday_day IS NOT NULL
    `).all(userId) as any[];

    const results: Array<{
      contact_id: string;
      contact_name: string;
      birthday_display: string | null;
      birthday_date: string | null;
      birthday_mode: string;
      age_turning: number | null;
      days_until: number;
      is_today: boolean;
    }> = [];

    for (const row of rows) {
      const bMonth = row.birthday_month;
      const bDay = row.birthday_day;

      // Calculate days until next birthday
      let nextBirthday = new Date(todayYear, bMonth - 1, bDay);
      // If this year's birthday has passed, use next year
      if (nextBirthday < new Date(todayYear, now.getMonth(), todayDay)) {
        nextBirthday = new Date(todayYear + 1, bMonth - 1, bDay);
      }
      const diffMs = nextBirthday.getTime() - new Date(todayYear, now.getMonth(), todayDay).getTime();
      const daysUntil = Math.round(diffMs / 86400000);
      const isToday = daysUntil === 0;

      // Check if within filter criteria
      if (options.month !== undefined) {
        // Filter by specific month
        if (bMonth !== options.month) continue;
      } else {
        // Filter by days_ahead
        const daysAhead = options.days_ahead ?? 30;
        if (daysUntil > daysAhead) continue;
      }

      // Calculate age turning
      let ageTurning: number | null = null;
      if (row.birthday_mode === 'full_date' && row.birthday_date) {
        const birthYear = parseInt(row.birthday_date.split('-')[0], 10);
        const birthdayYear = isToday ? todayYear : nextBirthday.getFullYear();
        ageTurning = birthdayYear - birthYear;
      } else if (row.birthday_mode === 'approximate_age' && row.birthday_year_approximate) {
        const birthdayYear = isToday ? todayYear : nextBirthday.getFullYear();
        ageTurning = birthdayYear - row.birthday_year_approximate;
      }

      const contactName = [row.first_name, row.last_name].filter(Boolean).join(' ');

      results.push({
        contact_id: row.id,
        contact_name: contactName,
        birthday_display: formatBirthdayDisplay(row),
        birthday_date: row.birthday_date ?? null,
        birthday_mode: row.birthday_mode,
        age_turning: ageTurning,
        days_until: daysUntil,
        is_today: isToday,
      });
    }

    // Sort by days_until ascending (soonest first)
    results.sort((a, b) => a.days_until - b.days_until);

    return { data: results, total: results.length };
  }

  // ─── Merge ──────────────────────────────────────────────────────

  merge(userId: string, primaryId: string, secondaryId: string): { contact: Contact; summary: Record<string, number> } {
    if (primaryId === secondaryId) {
      throw new Error('Cannot merge a contact with itself');
    }

    // Verify both contacts belong to the user and exist
    const primary = this.get(userId, primaryId);
    if (!primary) throw new Error('Primary contact not found');

    const secondary = this.get(userId, secondaryId);
    if (!secondary) throw new Error('Secondary contact not found');

    const summary: Record<string, number> = {};

    const doMerge = this.db.transaction(() => {
      // ── 1. Simple child tables: just UPDATE contact_id ──
      const simpleTables = ['notes', 'contact_methods', 'addresses', 'reminders', 'gifts', 'debts'] as const;
      for (const table of simpleTables) {
        const result = this.db.prepare(
          `UPDATE ${table} SET contact_id = ? WHERE contact_id = ?`
        ).run(primaryId, secondaryId);
        if (result.changes > 0) summary[table] = result.changes;
      }

      // tasks: contact_id is nullable, just reassign
      const tasksResult = this.db.prepare(
        'UPDATE tasks SET contact_id = ? WHERE contact_id = ?'
      ).run(primaryId, secondaryId);
      if (tasksResult.changes > 0) summary['tasks'] = tasksResult.changes;

      // ── 2. life_events: reassign main contact_id and junction table ──
      const lifeEventsResult = this.db.prepare(
        'UPDATE life_events SET contact_id = ? WHERE contact_id = ?'
      ).run(primaryId, secondaryId);
      if (lifeEventsResult.changes > 0) summary['life_events'] = lifeEventsResult.changes;

      // life_event_contacts junction: delete duplicates first, then update
      this.db.prepare(`
        DELETE FROM life_event_contacts
        WHERE contact_id = ? AND life_event_id IN (
          SELECT life_event_id FROM life_event_contacts WHERE contact_id = ?
        )
      `).run(secondaryId, primaryId);
      const lecResult = this.db.prepare(
        'UPDATE life_event_contacts SET contact_id = ? WHERE contact_id = ?'
      ).run(primaryId, secondaryId);
      if (lecResult.changes > 0) summary['life_event_contacts'] = lecResult.changes;

      // ── 3. activity_participants junction: avoid PK conflicts ──
      this.db.prepare(`
        DELETE FROM activity_participants
        WHERE contact_id = ? AND activity_id IN (
          SELECT activity_id FROM activity_participants WHERE contact_id = ?
        )
      `).run(secondaryId, primaryId);
      const apResult = this.db.prepare(
        'UPDATE activity_participants SET contact_id = ? WHERE contact_id = ?'
      ).run(primaryId, secondaryId);
      if (apResult.changes > 0) summary['activity_participants'] = apResult.changes;

      // ── 4. contact_tags: INSERT OR IGNORE to avoid duplicates ──
      const secondaryTags = this.db.prepare(
        'SELECT tag_id FROM contact_tags WHERE contact_id = ?'
      ).all(secondaryId) as { tag_id: string }[];
      let tagsMovedCount = 0;
      for (const row of secondaryTags) {
        const insertResult = this.db.prepare(
          'INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)'
        ).run(primaryId, row.tag_id);
        if (insertResult.changes > 0) tagsMovedCount++;
      }
      this.db.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(secondaryId);
      if (tagsMovedCount > 0) summary['contact_tags'] = tagsMovedCount;

      // ── 5. Relationships: handle self-relationship and dedup ──
      // Get all relationships where secondary is on either side
      const secondaryRelsFwd = this.db.prepare(
        'SELECT * FROM relationships WHERE contact_id = ?'
      ).all(secondaryId) as { id: string; contact_id: string; related_contact_id: string; relationship_type: string }[];

      const secondaryRelsRev = this.db.prepare(
        'SELECT * FROM relationships WHERE related_contact_id = ?'
      ).all(secondaryId) as { id: string; contact_id: string; related_contact_id: string; relationship_type: string }[];

      let relationshipsMovedCount = 0;

      // Forward relationships: secondary -> X  =>  primary -> X
      for (const rel of secondaryRelsFwd) {
        if (rel.related_contact_id === primaryId) {
          // Self-relationship: secondary -> primary would become primary -> primary. Delete it.
          this.db.prepare('DELETE FROM relationships WHERE id = ?').run(rel.id);
          continue;
        }
        // Check if primary already has this relationship type with the same related contact
        const existing = this.db.prepare(
          'SELECT id FROM relationships WHERE contact_id = ? AND related_contact_id = ? AND relationship_type = ?'
        ).get(primaryId, rel.related_contact_id, rel.relationship_type);
        if (existing) {
          // Duplicate: delete secondary's
          this.db.prepare('DELETE FROM relationships WHERE id = ?').run(rel.id);
        } else {
          // Move to primary
          this.db.prepare(
            'UPDATE relationships SET contact_id = ? WHERE id = ?'
          ).run(primaryId, rel.id);
          relationshipsMovedCount++;
        }
      }

      // Reverse relationships: X -> secondary  =>  X -> primary
      for (const rel of secondaryRelsRev) {
        if (rel.contact_id === primaryId) {
          // Self-relationship: primary -> secondary would become primary -> primary. Delete it.
          this.db.prepare('DELETE FROM relationships WHERE id = ?').run(rel.id);
          continue;
        }
        // Check if the same contact already has this relationship to primary
        const existing = this.db.prepare(
          'SELECT id FROM relationships WHERE contact_id = ? AND related_contact_id = ? AND relationship_type = ?'
        ).get(rel.contact_id, primaryId, rel.relationship_type);
        if (existing) {
          this.db.prepare('DELETE FROM relationships WHERE id = ?').run(rel.id);
        } else {
          this.db.prepare(
            'UPDATE relationships SET related_contact_id = ? WHERE id = ?'
          ).run(primaryId, rel.id);
          relationshipsMovedCount++;
        }
      }
      if (relationshipsMovedCount > 0) summary['relationships'] = relationshipsMovedCount;

      // ── 6. food_preferences: merge JSON arrays ──
      const primaryFood = this.db.prepare(
        'SELECT * FROM food_preferences WHERE contact_id = ?'
      ).get(primaryId) as any;
      const secondaryFood = this.db.prepare(
        'SELECT * FROM food_preferences WHERE contact_id = ?'
      ).get(secondaryId) as any;

      if (secondaryFood) {
        if (primaryFood) {
          // Merge arrays (union)
          const arrayFields = ['dietary_restrictions', 'allergies', 'favorite_foods', 'disliked_foods'] as const;
          const updates: string[] = [];
          const values: any[] = [];
          for (const field of arrayFields) {
            const primaryArr: string[] = primaryFood[field] ? JSON.parse(primaryFood[field]) : [];
            const secondaryArr: string[] = secondaryFood[field] ? JSON.parse(secondaryFood[field]) : [];
            const merged = [...new Set([...primaryArr, ...secondaryArr])];
            updates.push(`${field} = ?`);
            values.push(JSON.stringify(merged));
          }
          // Merge notes: concat if both have notes
          const primaryNotes = primaryFood.notes || '';
          const secondaryNotes = secondaryFood.notes || '';
          if (secondaryNotes && !primaryNotes) {
            updates.push('notes = ?');
            values.push(secondaryNotes);
          } else if (secondaryNotes && primaryNotes) {
            updates.push('notes = ?');
            values.push(`${primaryNotes}\n${secondaryNotes}`);
          }
          values.push(primaryId);
          this.db.prepare(
            `UPDATE food_preferences SET ${updates.join(', ')} WHERE contact_id = ?`
          ).run(...values);
          // Delete secondary's food_preferences
          this.db.prepare('DELETE FROM food_preferences WHERE contact_id = ?').run(secondaryId);
          summary['food_preferences'] = 1;
        } else {
          // Move secondary's food prefs to primary
          this.db.prepare(
            'UPDATE food_preferences SET contact_id = ? WHERE contact_id = ?'
          ).run(primaryId, secondaryId);
          summary['food_preferences'] = 1;
        }
      }

      // ── 7. custom_fields: only copy fields that don't exist on primary ──
      const primaryFields = this.db.prepare(
        'SELECT field_name FROM custom_fields WHERE contact_id = ?'
      ).all(primaryId) as { field_name: string }[];
      const primaryFieldNames = new Set(primaryFields.map(f => f.field_name));

      const secondaryFields = this.db.prepare(
        'SELECT * FROM custom_fields WHERE contact_id = ?'
      ).all(secondaryId) as { id: string; field_name: string }[];

      let customFieldsMoved = 0;
      for (const field of secondaryFields) {
        if (primaryFieldNames.has(field.field_name)) {
          // Primary already has this field, delete secondary's
          this.db.prepare('DELETE FROM custom_fields WHERE id = ?').run(field.id);
        } else {
          // Move to primary
          this.db.prepare(
            'UPDATE custom_fields SET contact_id = ? WHERE id = ?'
          ).run(primaryId, field.id);
          customFieldsMoved++;
        }
      }
      if (customFieldsMoved > 0) summary['custom_fields'] = customFieldsMoved;

      // ── 8. Copy non-null fields from secondary to primary where primary is null ──
      const fillableFields = [
        'last_name', 'nickname', 'maiden_name', 'gender', 'pronouns', 'avatar_url',
        'birthday_mode', 'birthday_date', 'birthday_month', 'birthday_day', 'birthday_year_approximate',
        'deceased_date', 'met_at_date', 'met_at_location', 'met_through_contact_id', 'met_description',
        'job_title', 'company', 'industry', 'work_notes',
      ];

      const primaryRow = this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(primaryId) as any;
      const secondaryRow = this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(secondaryId) as any;

      const fieldUpdates: string[] = [];
      const fieldValues: any[] = [];
      for (const field of fillableFields) {
        if (primaryRow[field] === null && secondaryRow[field] !== null) {
          fieldUpdates.push(`${field} = ?`);
          fieldValues.push(secondaryRow[field]);
        }
      }
      if (fieldUpdates.length > 0) {
        fieldUpdates.push("updated_at = datetime('now')");
        fieldValues.push(primaryId);
        this.db.prepare(
          `UPDATE contacts SET ${fieldUpdates.join(', ')} WHERE id = ?`
        ).run(...fieldValues);
        summary['fields_copied'] = fieldUpdates.length - 1; // minus the updated_at
      }

      // ── 9. Soft-delete the secondary contact ──
      this.db.prepare(`
        UPDATE contacts SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(secondaryId);
    });

    doMerge();

    const mergedContact = this.get(userId, primaryId)!;
    return { contact: mergedContact, summary };
  }

  // ─── Find Duplicates ──────────────────────────────────────────

  findDuplicates(userId: string): {
    data: Array<{
      contact_id_1: string;
      contact_name_1: string;
      contact_id_2: string;
      contact_name_2: string;
      reason: string;
    }>;
    total: number;
  } {
    const results: Array<{
      contact_id_1: string;
      contact_name_1: string;
      contact_id_2: string;
      contact_name_2: string;
      reason: string;
    }> = [];

    const seen = new Set<string>();
    const addResult = (id1: string, name1: string, id2: string, name2: string, reason: string) => {
      // Normalize pair key so we don't report A-B and B-A separately
      const pairKey = [id1, id2].sort().join(':') + ':' + reason;
      if (seen.has(pairKey)) return;
      seen.add(pairKey);
      results.push({
        contact_id_1: id1,
        contact_name_1: name1,
        contact_id_2: id2,
        contact_name_2: name2,
        reason,
      });
    };

    // 1. Exact name matches (normalized lowercase, trimmed)
    const nameMatches = this.db.prepare(`
      SELECT
        c1.id AS id1, TRIM(c1.first_name || ' ' || COALESCE(c1.last_name, '')) AS name1,
        c2.id AS id2, TRIM(c2.first_name || ' ' || COALESCE(c2.last_name, '')) AS name2
      FROM contacts c1
      JOIN contacts c2 ON c1.id < c2.id
        AND LOWER(TRIM(c1.first_name)) = LOWER(TRIM(c2.first_name))
        AND LOWER(TRIM(COALESCE(c1.last_name, ''))) = LOWER(TRIM(COALESCE(c2.last_name, '')))
        AND COALESCE(c1.last_name, '') != ''
      WHERE c1.user_id = ? AND c2.user_id = ?
        AND c1.deleted_at IS NULL AND c2.deleted_at IS NULL
    `).all(userId, userId) as any[];

    for (const row of nameMatches) {
      addResult(row.id1, row.name1, row.id2, row.name2, 'same name');
    }

    // 2. Same email address
    const emailMatches = this.db.prepare(`
      SELECT
        cm1.contact_id AS id1,
        TRIM(c1.first_name || ' ' || COALESCE(c1.last_name, '')) AS name1,
        cm2.contact_id AS id2,
        TRIM(c2.first_name || ' ' || COALESCE(c2.last_name, '')) AS name2,
        cm1.value AS email
      FROM contact_methods cm1
      JOIN contact_methods cm2 ON cm1.contact_id < cm2.contact_id
        AND LOWER(TRIM(cm1.value)) = LOWER(TRIM(cm2.value))
        AND cm1.type = 'email' AND cm2.type = 'email'
      JOIN contacts c1 ON cm1.contact_id = c1.id AND c1.user_id = ? AND c1.deleted_at IS NULL
      JOIN contacts c2 ON cm2.contact_id = c2.id AND c2.user_id = ? AND c2.deleted_at IS NULL
    `).all(userId, userId) as any[];

    for (const row of emailMatches) {
      addResult(row.id1, row.name1, row.id2, row.name2, `same email: ${row.email}`);
    }

    // 3. Same phone number (normalize by stripping non-digits for comparison)
    const phoneMatches = this.db.prepare(`
      SELECT
        cm1.contact_id AS id1,
        TRIM(c1.first_name || ' ' || COALESCE(c1.last_name, '')) AS name1,
        cm2.contact_id AS id2,
        TRIM(c2.first_name || ' ' || COALESCE(c2.last_name, '')) AS name2,
        cm1.value AS phone
      FROM contact_methods cm1
      JOIN contact_methods cm2 ON cm1.contact_id < cm2.contact_id
        AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cm1.value, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
         = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cm2.value, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
        AND cm1.type = 'phone' AND cm2.type = 'phone'
      JOIN contacts c1 ON cm1.contact_id = c1.id AND c1.user_id = ? AND c1.deleted_at IS NULL
      JOIN contacts c2 ON cm2.contact_id = c2.id AND c2.user_id = ? AND c2.deleted_at IS NULL
    `).all(userId, userId) as any[];

    for (const row of phoneMatches) {
      addResult(row.id1, row.name1, row.id2, row.name2, `same phone: ${row.phone}`);
    }

    // Sort by first contact name and limit to top 20
    results.sort((a, b) => a.contact_name_1.localeCompare(b.contact_name_1));
    const limited = results.slice(0, 20);

    return { data: limited, total: results.length };
  }

  batchCreate(userId: string, inputs: CreateContactInput[]): Contact[] {
    if (inputs.length > 50) {
      throw new Error('Batch size exceeds maximum of 50 items');
    }

    const results: Contact[] = [];

    const transaction = this.db.transaction(() => {
      for (let i = 0; i < inputs.length; i++) {
        try {
          const contact = this.create(userId, inputs[i]);
          results.push(contact);
        } catch (err: any) {
          throw new Error(`Failed to create contact at index ${i}: ${err.message}`);
        }
      }
    });

    transaction();
    return results;
  }

  private mapRow(row: any): Contact {
    const contact: Contact = {
      ...row,
      is_favorite: Boolean(row.is_favorite),
      is_me: Boolean(row.is_me),
    };

    // Calculate age if birthday info is available
    const ageInfo = calculateAge(contact);
    if (ageInfo) {
      contact.age = ageInfo.age;
      contact.age_approximate = ageInfo.approximate;
    }

    // Generate human-readable birthday description for LLM clarity
    contact.birthday_display = formatBirthdayDisplay(contact);

    return contact;
  }
}
