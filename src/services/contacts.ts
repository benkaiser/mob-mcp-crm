import Database from 'better-sqlite3';

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

// ─── Service ────────────────────────────────────────────────────

export class ContactService {
  constructor(private db: Database.Database) {}

  create(userId: string, input: CreateContactInput): Contact {
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    const now = new Date().toISOString();

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
      id, userId, input.first_name, input.last_name ?? null, input.nickname ?? null, input.maiden_name ?? null,
      input.gender ?? null, input.pronouns ?? null, input.avatar_url ?? null,
      input.birthday_mode ?? null, input.birthday_date ?? null, input.birthday_month ?? null, input.birthday_day ?? null, input.birthday_year_approximate ?? null,
      input.status ?? 'active', input.deceased_date ?? null, input.is_favorite ? 1 : 0,
      input.met_at_date ?? null, input.met_at_location ?? null, input.met_through_contact_id ?? null, input.met_description ?? null,
      input.job_title ?? null, input.company ?? null, input.industry ?? null, input.work_notes ?? null,
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
      if (inputKey in input) {
        fields.push(`${dbColumn} = ?`);
        let value = (input as any)[inputKey];
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
    const result = this.db.prepare(`
      UPDATE contacts
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(contactId, userId);

    return result.changes > 0;
  }

  list(userId: string, options: ListContactsOptions = {}): PaginatedResult<Contact> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['user_id = ?', 'deleted_at IS NULL'];
    const params: any[] = [userId];

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
        nickname LIKE ? OR
        company LIKE ? OR
        job_title LIKE ?
      )`);
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
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

  private mapRow(row: any): Contact {
    const contact: Contact = {
      ...row,
      is_favorite: Boolean(row.is_favorite),
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
