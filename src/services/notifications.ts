import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { UserSettingsService } from './settings.js';

// ─── Types ──────────────────────────────────────────────────────

export type NotificationType = 'birthday' | 'reminder' | 'follow_up' | 'custom';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  contact_id: string | null;
  source_type: string | null;
  source_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  contact_id?: string;
  source_type?: string;
  source_id?: string;
}

export interface ListNotificationsOptions {
  unread_only?: boolean;
  page?: number;
  per_page?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Service ────────────────────────────────────────────────────

export class NotificationService {
  constructor(private db: Database.Database) {}

  create(userId: string, input: CreateNotificationInput): Notification {
    const id = generateId();

    this.db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, contact_id, source_type, source_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.type, input.title, input.body ?? null,
      input.contact_id ?? null, input.source_type ?? null, input.source_id ?? null);

    return this.getById(id)!;
  }

  get(id: string): Notification | null {
    return this.getById(id);
  }

  markRead(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE notifications SET is_read = 1, read_at = datetime('now')
      WHERE id = ? AND is_read = 0
    `).run(id);
    return result.changes > 0;
  }

  markAllRead(userId: string): number {
    const result = this.db.prepare(`
      UPDATE notifications SET is_read = 1, read_at = datetime('now')
      WHERE user_id = ? AND is_read = 0
    `).run(userId);
    return result.changes;
  }

  list(userId: string, options: ListNotificationsOptions = {}): PaginatedResult<Notification> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['user_id = ?'];
    const params: any[] = [userId];

    if (options.unread_only) {
      conditions.push('is_read = 0');
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM notifications WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT * FROM notifications WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    const data = rows.map((r) => this.mapRow(r));

    return { data, total: countResult.count, page, per_page: perPage };
  }

  /**
   * Generate birthday notifications for contacts with birthdays within the configured offsets.
   * Uses user settings for reminder offsets if available, falls back to daysAhead parameter.
   */
  generateBirthdayNotifications(userId: string, daysAhead?: number, timezone?: string): Notification[] {
    const generated: Notification[] = [];

    // Load user settings for offsets
    let offsets: number[];
    if (daysAhead !== undefined) {
      // Legacy: use daysAhead as a single window
      offsets = Array.from({ length: daysAhead + 1 }, (_, i) => i);
    } else {
      try {
        const settingsService = new UserSettingsService(this.db);
        const settings = settingsService.get(userId);
        offsets = settings.birthday_reminder_offsets;
      } catch {
        offsets = [0, 7, 30];
      }
    }

    // Compute today in the user's timezone to avoid off-by-one errors
    // when the server runs in UTC and the user is in a positive-offset timezone
    const now = new Date();
    const userDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [todayYear, todayMonth, todayDay] = userDateStr.split('-').map(Number);

    // Get contacts with birthday info
    const contacts = this.db.prepare(`
      SELECT id, first_name, last_name, birthday_mode, birthday_date, birthday_month, birthday_day
      FROM contacts
      WHERE user_id = ? AND deleted_at IS NULL
        AND birthday_mode IS NOT NULL
    `).all(userId) as any[];

    for (const contact of contacts) {
      let bMonth: number | null = null;
      let bDay: number | null = null;

      if (contact.birthday_mode === 'full_date' && contact.birthday_date) {
        const parts = contact.birthday_date.split('-');
        bMonth = parseInt(parts[1], 10);
        bDay = parseInt(parts[2], 10);
      } else if (contact.birthday_mode === 'month_day') {
        bMonth = contact.birthday_month;
        bDay = contact.birthday_day;
      }

      if (bMonth === null || bDay === null) continue;

      // Check if birthday matches any offset.
      // Use timezone-aware today values computed above.
      // Use Date.UTC to ensure arithmetic is always in UTC regardless of the
      // server's local timezone (prevents DST transitions on the server from
      // skewing the day difference by ±1).
      const todayDayOfYear = Date.UTC(todayYear, todayMonth - 1, todayDay);
      const birthdayThisYear = Date.UTC(todayYear, bMonth - 1, bDay);
      const diffDays = Math.round((birthdayThisYear - todayDayOfYear) / 86400000);

      if (offsets.includes(diffDays)) {
        // Check if notification already exists for this contact + offset this year
        const existing = this.db.prepare(`
          SELECT id FROM notifications
          WHERE user_id = ? AND type = 'birthday' AND contact_id = ?
            AND created_at >= date('now', 'start of year')
            AND title LIKE ?
        `).get(userId, contact.id, diffDays === 0 ? '%today%' : `%${diffDays} day%`);

        if (!existing) {
          const name = contact.first_name + (contact.last_name ? ' ' + contact.last_name : '');
          const notification = this.create(userId, {
            type: 'birthday',
            title: `${name}'s birthday is ${diffDays === 0 ? 'today' : `in ${diffDays} day${diffDays > 1 ? 's' : ''}`}!`,
            contact_id: contact.id,
            source_type: 'birthday',
            // Encode the offset in source_id so the push-window catch-up in the scheduler
            // can identify day-of (offset=0) notifications without relying on title text.
            source_id: `birthday-${todayYear}-${diffDays}`,
          });
          generated.push(notification);
        }
      }
    }

    return generated;
  }

  /**
   * Record the result of a push notification delivery attempt.
   * Increments push_attempts and sets push_sent = 1 on success.
   */
  recordPushResult(notificationId: string, sent: boolean): void {
    this.db.prepare(`
      UPDATE notifications
      SET push_attempts = push_attempts + 1, push_sent = ?
      WHERE id = ?
    `).run(sent ? 1 : 0, notificationId);
  }

  /**
   * Get notifications that failed push delivery and are eligible for retry.
   * Returns notifications where push was attempted but not sent, within the last 48 hours,
   * and below the max attempt threshold.
   */
  getPendingPushRetries(userId: string, maxAttempts: number = 3): Notification[] {
    const rows = this.db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ? AND push_sent = 0 AND push_attempts > 0 AND push_attempts < ?
        AND created_at >= datetime('now', '-48 hours')
      ORDER BY created_at ASC
    `).all(userId, maxAttempts) as any[];

    return rows.map((r) => this.mapRow(r));
  }

  private getById(id: string): Notification | null {
    const row = this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: any): Notification {
    return {
      ...row,
      is_read: Boolean(row.is_read),
    };
  }
}
