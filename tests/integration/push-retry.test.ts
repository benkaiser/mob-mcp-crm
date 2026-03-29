import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NotificationService } from '../../src/services/notifications.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('Push notification retry tracking', () => {
  let db: Database.Database;
  let service: NotificationService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new NotificationService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Matheu', lastName: 'Baillie' });
  });

  afterEach(() => closeDatabase(db));

  /** Helper: create a notification and return its ID */
  function createNotification(title = 'Test birthday notification'): string {
    const notification = service.create(userId, {
      type: 'birthday',
      title,
      body: 'Happy birthday!',
      contact_id: contactId,
      source_type: 'birthday',
    });
    return notification.id;
  }

  describe('recordPushResult', () => {
    it('marks success — sets push_sent = 1 and push_attempts = 1', () => {
      const id = createNotification();

      service.recordPushResult(id, true);

      const row = db.prepare('SELECT push_sent, push_attempts FROM notifications WHERE id = ?').get(id) as any;
      expect(row.push_sent).toBe(1);
      expect(row.push_attempts).toBe(1);
    });

    it('tracks failure — sets push_sent = 0 and push_attempts = 1', () => {
      const id = createNotification();

      service.recordPushResult(id, false);

      const row = db.prepare('SELECT push_sent, push_attempts FROM notifications WHERE id = ?').get(id) as any;
      expect(row.push_sent).toBe(0);
      expect(row.push_attempts).toBe(1);
    });

    it('increments push_attempts on each call', () => {
      const id = createNotification();

      service.recordPushResult(id, false);
      service.recordPushResult(id, false);

      const row = db.prepare('SELECT push_sent, push_attempts FROM notifications WHERE id = ?').get(id) as any;
      expect(row.push_attempts).toBe(2);
      expect(row.push_sent).toBe(0);
    });

    it('overwrites push_sent on eventual success', () => {
      const id = createNotification();

      service.recordPushResult(id, false);
      service.recordPushResult(id, true);

      const row = db.prepare('SELECT push_sent, push_attempts FROM notifications WHERE id = ?').get(id) as any;
      expect(row.push_sent).toBe(1);
      expect(row.push_attempts).toBe(2);
    });
  });

  describe('getPendingPushRetries', () => {
    it('returns failed notifications that are eligible for retry', () => {
      const id = createNotification();
      service.recordPushResult(id, false);

      const retries = service.getPendingPushRetries(userId);
      expect(retries).toHaveLength(1);
      expect(retries[0].id).toBe(id);
    });

    it('excludes successful pushes', () => {
      const id = createNotification();
      service.recordPushResult(id, true);

      const retries = service.getPendingPushRetries(userId);
      expect(retries).toHaveLength(0);
    });

    it('excludes notifications at max attempts', () => {
      const id = createNotification();
      service.recordPushResult(id, false);
      service.recordPushResult(id, false);
      service.recordPushResult(id, false);

      // Default maxAttempts = 3, so 3 attempts should be excluded
      const retries = service.getPendingPushRetries(userId);
      expect(retries).toHaveLength(0);
    });

    it('respects custom maxAttempts', () => {
      const id = createNotification();
      service.recordPushResult(id, false);

      // With maxAttempts = 1, a single attempt means it's already at the max
      const retries = service.getPendingPushRetries(userId, 1);
      expect(retries).toHaveLength(0);

      // With maxAttempts = 2, a single attempt is still eligible
      const retries2 = service.getPendingPushRetries(userId, 2);
      expect(retries2).toHaveLength(1);
    });

    it('excludes old notifications (> 48 hours)', () => {
      // Directly insert a notification with old created_at
      db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, contact_id, source_type, push_attempts, push_sent, created_at)
        VALUES ('old-notif', ?, 'birthday', 'Old notification', 'body', ?, 'birthday', 1, 0, datetime('now', '-49 hours'))
      `).run(userId, contactId);

      const retries = service.getPendingPushRetries(userId);
      expect(retries).toHaveLength(0);
    });

    it('excludes notifications with 0 attempts (never attempted)', () => {
      // Create a fresh notification — push_attempts defaults to 0
      createNotification();

      const retries = service.getPendingPushRetries(userId);
      expect(retries).toHaveLength(0);
    });

    it('only returns notifications for the specified user', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const id = createNotification();
      service.recordPushResult(id, false);

      const retries = service.getPendingPushRetries(otherUserId);
      expect(retries).toHaveLength(0);
    });
  });
});
