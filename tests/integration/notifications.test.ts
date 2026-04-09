import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { NotificationService } from '../../src/services/notifications.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('NotificationService', () => {
  let db: Database.Database;
  let service: NotificationService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new NotificationService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice' });
  });

  afterEach(() => closeDatabase(db));

  it('should create a notification', () => {
    const notification = service.create(userId, {
      type: 'custom',
      title: 'Test notification',
      body: 'This is a test',
      contact_id: contactId,
    });

    expect(notification.id).toBeDefined();
    expect(notification.type).toBe('custom');
    expect(notification.title).toBe('Test notification');
    expect(notification.body).toBe('This is a test');
    expect(notification.contact_id).toBe(contactId);
    expect(notification.is_read).toBe(false);
    expect(notification.read_at).toBeNull();
  });

  it('should get a notification by ID', () => {
    const created = service.create(userId, {
      type: 'reminder',
      title: 'Reminder notification',
    });

    const fetched = service.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('should mark a notification as read', () => {
    const notification = service.create(userId, {
      type: 'custom',
      title: 'To read',
    });

    expect(service.markRead(notification.id)).toBe(true);
    const fetched = service.get(notification.id);
    expect(fetched!.is_read).toBe(true);
    expect(fetched!.read_at).not.toBeNull();
  });

  it('should return false when marking already-read notification', () => {
    const notification = service.create(userId, {
      type: 'custom',
      title: 'Already read',
    });

    service.markRead(notification.id);
    expect(service.markRead(notification.id)).toBe(false);
  });

  it('should mark all notifications as read', () => {
    service.create(userId, { type: 'custom', title: 'N1' });
    service.create(userId, { type: 'custom', title: 'N2' });
    service.create(userId, { type: 'custom', title: 'N3' });

    const count = service.markAllRead(userId);
    expect(count).toBe(3);

    const result = service.list(userId, { unread_only: true });
    expect(result.data).toHaveLength(0);
  });

  it('should list notifications newest first', () => {
    // Insert with explicit created_at to avoid same-millisecond race
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, created_at)
      VALUES ('n1', ?, 'custom', 'First', '2024-06-01T10:00:00Z')
    `).run(userId);
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, created_at)
      VALUES ('n2', ?, 'custom', 'Second', '2024-06-02T10:00:00Z')
    `).run(userId);

    const result = service.list(userId);
    expect(result.data).toHaveLength(2);
    // newest first
    expect(result.data[0].title).toBe('Second');
    expect(result.data[1].title).toBe('First');
  });

  it('should filter unread only', () => {
    const n1 = service.create(userId, { type: 'custom', title: 'Read one' });
    service.create(userId, { type: 'custom', title: 'Unread one' });

    service.markRead(n1.id);

    const result = service.list(userId, { unread_only: true });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Unread one');
  });

  it('should paginate notifications', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, { type: 'custom', title: `N${i}` });
    }

    const page1 = service.list(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });

  it('should create notification with source tracking', () => {
    const notification = service.create(userId, {
      type: 'reminder',
      title: 'Reminder due',
      source_type: 'reminder',
      source_id: 'some-reminder-id',
    });

    expect(notification.source_type).toBe('reminder');
    expect(notification.source_id).toBe('some-reminder-id');
  });

  it('should create notification without optional fields', () => {
    const notification = service.create(userId, {
      type: 'custom',
      title: 'Minimal',
    });

    expect(notification.body).toBeNull();
    expect(notification.contact_id).toBeNull();
    expect(notification.source_type).toBeNull();
    expect(notification.source_id).toBeNull();
  });

  describe('generateBirthdayNotifications', () => {
    it('should generate a notification for a birthday that is today (0 days)', () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();

      // Insert a contact whose birthday is today
      db.prepare(`
        INSERT INTO contacts (id, user_id, first_name, birthday_mode, birthday_month, birthday_day, status, is_favorite, created_at, updated_at)
        VALUES ('today-contact', ?, 'TodayBirthday', 'month_day', ?, ?, 'active', 0, datetime('now'), datetime('now'))
      `).run(userId, month, day);

      const notifications = service.generateBirthdayNotifications(userId);
      const todayNotif = notifications.find(n => n.contact_id === 'today-contact');
      expect(todayNotif).toBeDefined();
      expect(todayNotif!.title).toContain('today');
    });

    it('should generate a "today" notification using the configured timezone (UTC+10)', () => {
      // Verify that generateBirthdayNotifications uses the passed timezone to determine
      // "today" rather than always using the server's UTC clock. We compute today's date
      // in Australia/Brisbane (UTC+10) and set the contact's birthday to match, then
      // confirm a "today" notification is generated when the timezone is passed correctly.
      const now = new Date();
      const utc10DateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Brisbane',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(now);
      const [, monthStr, dayStr] = utc10DateStr.split('-');
      const utc10Month = parseInt(monthStr, 10);
      const utc10Day = parseInt(dayStr, 10);

      db.prepare(`
        INSERT INTO contacts (id, user_id, first_name, birthday_mode, birthday_month, birthday_day, status, is_favorite, created_at, updated_at)
        VALUES ('utc10-today', ?, 'UTC10TodayBirthday', 'month_day', ?, ?, 'active', 0, datetime('now'), datetime('now'))
      `).run(userId, utc10Month, utc10Day);

      // Call with Australia/Brisbane timezone — must see diffDays=0 for this contact
      const notifications = service.generateBirthdayNotifications(userId, undefined, 'Australia/Brisbane');
      const todayNotif = notifications.find(n => n.contact_id === 'utc10-today');
      expect(todayNotif).toBeDefined();
      expect(todayNotif!.title).toContain('today');
      // Verify source_id encodes offset 0 (day-of)
      expect(todayNotif!.source_id).toMatch(/-0$/);
    });

    it('should NOT treat the UTC date as "today" when the UTC+10 date is different', () => {
      // When generateBirthdayNotifications is called with 'Australia/Brisbane' timezone,
      // it must use the UTC+10 date for diffDays computation. A contact whose birthday
      // matches the *UTC* day but not the *UTC+10* day should not get a "today" notification.
      // This only has observable effect when UTC and UTC+10 are on different calendar days
      // (14:00–23:59 UTC), but the underlying logic is always exercised: the function
      // correctly uses the timezone parameter for all hour ranges.
      const now = new Date();
      const utcMonth = now.getUTCMonth() + 1;
      const utcDay = now.getUTCDate();

      // Compute UTC+10 date
      const utc10DateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Brisbane',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(now);
      const [, utc10MonthStr, utc10DayStr] = utc10DateStr.split('-');
      const utc10Month = parseInt(utc10MonthStr, 10);
      const utc10Day = parseInt(utc10DayStr, 10);

      // Only assert the stricter check when UTC and UTC+10 are on different days.
      // When they are on the same day the UTC contact birthday matches UTC+10 too, so
      // we can only verify that the contact IS found (not that it's excluded).
      if (utcMonth !== utc10Month || utcDay !== utc10Day) {
        // The UTC "today" is a different calendar day from UTC+10 "today"
        db.prepare(`
          INSERT INTO contacts (id, user_id, first_name, birthday_mode, birthday_month, birthday_day, status, is_favorite, created_at, updated_at)
          VALUES ('utc-only-today', ?, 'UTCOnlyBirthday', 'month_day', ?, ?, 'active', 0, datetime('now'), datetime('now'))
        `).run(userId, utcMonth, utcDay);

        const notifications = service.generateBirthdayNotifications(userId, undefined, 'Australia/Brisbane');
        const utcTodayNotif = notifications.find(n => n.contact_id === 'utc-only-today');
        // Not "today" from UTC+10's perspective (diffDays ≠ 0)
        expect(utcTodayNotif).toBeUndefined();
      }
    });

    it('deterministic: UTC+10 "today" is generated correctly when UTC is still on the previous day', () => {
      // Pin the clock to 2026-03-28T22:00:00Z = March 29 08:00 Australia/Brisbane.
      // The UTC date is March 28, but the UTC+10 date is March 29.
      // A contact with birthday on March 29 should get a "today" notification when the
      // timezone is 'Australia/Brisbane', but NOT when the (default) UTC timezone is used.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-28T22:00:00Z'));
      try {
        // Birthday March 29 — "today" in UTC+10, but "tomorrow" in UTC
        db.prepare(`
          INSERT INTO contacts (id, user_id, first_name, birthday_mode, birthday_month, birthday_day, status, is_favorite, created_at, updated_at)
          VALUES ('tz-test', ?, 'TZTest', 'month_day', 3, 29, 'active', 0, datetime('now'), datetime('now'))
        `).run(userId);

        // Without timezone override (defaults to UTC): March 28 in UTC → diffDays = 1, not today
        const utcNotifs = service.generateBirthdayNotifications(userId);
        expect(utcNotifs.find(n => n.contact_id === 'tz-test')).toBeUndefined();

        // With Australia/Brisbane: March 29 in UTC+10 → diffDays = 0, generates "today"
        const brisbaneNotifs = service.generateBirthdayNotifications(userId, undefined, 'Australia/Brisbane');
        const todayNotif = brisbaneNotifs.find(n => n.contact_id === 'tz-test');
        expect(todayNotif).toBeDefined();
        expect(todayNotif!.title).toContain('today');
        expect(todayNotif!.source_id).toBe('birthday-2026-0');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not generate a duplicate notification for the same birthday in the same year', () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();

      db.prepare(`
        INSERT INTO contacts (id, user_id, first_name, birthday_mode, birthday_month, birthday_day, status, is_favorite, created_at, updated_at)
        VALUES ('dup-contact', ?, 'DupBirthday', 'month_day', ?, ?, 'active', 0, datetime('now'), datetime('now'))
      `).run(userId, month, day);

      const first = service.generateBirthdayNotifications(userId);
      expect(first.filter(n => n.contact_id === 'dup-contact')).toHaveLength(1);

      const second = service.generateBirthdayNotifications(userId);
      expect(second.filter(n => n.contact_id === 'dup-contact')).toHaveLength(0);
    });
  });
});
