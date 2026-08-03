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
