import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
