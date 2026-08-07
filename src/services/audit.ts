import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { UserSettingsService } from './settings.js';

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

export interface AuditRecordInput {
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  old_values?: unknown;
  new_values?: unknown;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface AuditStreakDay {
  date: string;
  active: boolean;
}

export interface AuditStreak {
  days: AuditStreakDay[];
  current_streak: number;
}

export interface RecentContact {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  last_interaction_at: string;
  last_entity_type: string;
  last_action: AuditAction;
}

export class AuditService {
  constructor(private db: Database.Database) {}

  record(userId: string, input: AuditRecordInput): AuditLogEntry {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, entity_type, entity_id, action, old_values, new_values, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      input.entity_type,
      input.entity_id,
      input.action,
      input.old_values === undefined ? null : JSON.stringify(input.old_values),
      input.new_values === undefined ? null : JSON.stringify(input.new_values),
      new Date().toISOString(),
    );

    return this.getById(id)!;
  }

  list(userId: string, options: { page?: number; per_page?: number } = {}): PaginatedResult<AuditLogEntry> {
    const page = Math.max(1, options.page ?? 1);
    const perPage = Math.min(Math.max(1, options.per_page ?? 25), 100);
    const offset = (page - 1) * perPage;

    const total = (this.db.prepare(
      'SELECT COUNT(*) AS count FROM audit_logs WHERE user_id = ?'
    ).get(userId) as { count: number }).count;

    const rows = this.db.prepare(`
      SELECT * FROM audit_logs
      WHERE user_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ? OFFSET ?
    `).all(userId, perPage, offset) as any[];

    return { data: rows.map((row) => this.mapRow(row)), total, page, per_page: perPage };
  }

  /**
   * Contacts the user has most recently interacted with, derived from the audit
   * log. "Interacted with" means any audited change to the contact itself or to
   * a record that belongs to a contact (activity participation, notes,
   * reminders, tasks, gifts, debts, life events, relationships, contact
   * methods, addresses, custom fields, tag assignments). Returns one row per
   * contact (its most recent interaction), newest first.
   */
  recentContacts(userId: string, limit = 5): RecentContact[] {
    const cap = Math.min(Math.max(1, limit), 50);
    const rows = this.db.prepare(`
      WITH recent AS (
        SELECT entity_type, entity_id, action, created_at, rowid AS seq
        FROM audit_logs
        WHERE user_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1000
      ),
      interactions AS (
        SELECT contact_id, entity_type, action, created_at, seq FROM (
          SELECT r.entity_type, r.action, r.created_at, r.seq,
            CASE r.entity_type
              WHEN 'contact' THEN r.entity_id
              WHEN 'note' THEN (SELECT contact_id FROM notes WHERE id = r.entity_id)
              WHEN 'reminder' THEN (SELECT contact_id FROM reminders WHERE id = r.entity_id)
              WHEN 'gift' THEN (SELECT contact_id FROM gifts WHERE id = r.entity_id)
              WHEN 'debt' THEN (SELECT contact_id FROM debts WHERE id = r.entity_id)
              WHEN 'life_event' THEN (SELECT contact_id FROM life_events WHERE id = r.entity_id)
              WHEN 'task' THEN (SELECT contact_id FROM tasks WHERE id = r.entity_id)
              WHEN 'contact_method' THEN (SELECT contact_id FROM contact_methods WHERE id = r.entity_id)
              WHEN 'address' THEN (SELECT contact_id FROM addresses WHERE id = r.entity_id)
              WHEN 'custom_field' THEN (SELECT contact_id FROM custom_fields WHERE id = r.entity_id)
              WHEN 'relationship' THEN (SELECT contact_id FROM relationships WHERE id = r.entity_id)
              WHEN 'contact_tag' THEN substr(r.entity_id, 1, instr(r.entity_id, ':') - 1)
              ELSE NULL
            END AS contact_id
          FROM recent r
        )
        WHERE contact_id IS NOT NULL
        UNION ALL
        SELECT ap.contact_id, r.entity_type, r.action, r.created_at, r.seq
        FROM recent r
        JOIN activity_participants ap ON ap.activity_id = r.entity_id
        WHERE r.entity_type = 'activity'
      ),
      ranked AS (
        SELECT contact_id, entity_type, action, created_at, seq,
          ROW_NUMBER() OVER (PARTITION BY contact_id ORDER BY created_at DESC, seq DESC) AS rn
        FROM interactions
      )
      SELECT c.id AS contact_id, c.first_name, c.last_name, c.nickname, c.avatar_url,
             rk.created_at AS last_interaction_at, rk.entity_type AS last_entity_type, rk.action AS last_action
      FROM ranked rk
      JOIN contacts c ON c.id = rk.contact_id AND c.user_id = ? AND c.deleted_at IS NULL
      WHERE rk.rn = 1
      ORDER BY rk.created_at DESC, rk.seq DESC
      LIMIT ?
    `).all(userId, userId, cap) as RecentContact[];
    return rows;
  }

  getStreak(userId: string): AuditStreak {
    const timezone = this.timezoneFor(userId);
    const today = localDate(new Date(), timezone);
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

    const rows = this.db.prepare(
      'SELECT created_at FROM audit_logs WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as { created_at: string }[];

    const activeDates = new Set(rows.map((row) => localDate(parseTimestamp(row.created_at), timezone)));

    let currentStreak = 0;
    for (let date = today; activeDates.has(date); date = addDays(date, -1)) {
      currentStreak++;
    }

    return {
      days: days.map((date) => ({ date, active: activeDates.has(date) })),
      current_streak: currentStreak,
    };
  }

  private getById(id: string): AuditLogEntry | null {
    const row = this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: any): AuditLogEntry {
    return {
      id: row.id,
      user_id: row.user_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      old_values: row.old_values ? JSON.parse(row.old_values) : null,
      new_values: row.new_values ? JSON.parse(row.new_values) : null,
      created_at: row.created_at,
    };
  }

  private timezoneFor(userId: string): string {
    try {
      const timezone = new UserSettingsService(this.db).get(userId).timezone;
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      return timezone;
    } catch {
      return 'UTC';
    }
  }
}

function parseTimestamp(value: string): Date {
  if (value.includes('T')) return new Date(value);
  return new Date(`${value.replace(' ', 'T')}Z`);
}

function localDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}
