import Database from 'better-sqlite3';

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
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);

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
   * Generate birthday notifications for contacts with birthdays within the given days.
   */
  generateBirthdayNotifications(userId: string, daysAhead = 7): Notification[] {
    const generated: Notification[] = [];
    const today = new Date();

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
        const d = new Date(contact.birthday_date);
        bMonth = d.getMonth() + 1;
        bDay = d.getDate();
      } else if (contact.birthday_mode === 'month_day') {
        bMonth = contact.birthday_month;
        bDay = contact.birthday_day;
      }

      if (bMonth === null || bDay === null) continue;

      // Check if birthday is within daysAhead
      const birthdayThisYear = new Date(today.getFullYear(), bMonth - 1, bDay);
      const diffDays = Math.floor((birthdayThisYear.getTime() - today.getTime()) / 86400000);

      if (diffDays >= 0 && diffDays <= daysAhead) {
        // Check if notification already exists for this year
        const existing = this.db.prepare(`
          SELECT id FROM notifications
          WHERE user_id = ? AND type = 'birthday' AND contact_id = ?
            AND created_at >= date('now', 'start of year')
        `).get(userId, contact.id);

        if (!existing) {
          const name = contact.first_name + (contact.last_name ? ' ' + contact.last_name : '');
          const notification = this.create(userId, {
            type: 'birthday',
            title: `${name}'s birthday is ${diffDays === 0 ? 'today' : `in ${diffDays} day${diffDays > 1 ? 's' : ''}`}!`,
            contact_id: contact.id,
            source_type: 'birthday',
          });
          generated.push(notification);
        }
      }
    }

    return generated;
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
