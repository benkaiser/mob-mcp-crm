import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PushNotificationService } from '../../src/services/push-notifications.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('PushNotificationService', () => {
  let db: Database.Database;
  let service: PushNotificationService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new PushNotificationService(db);
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  it('should initialize VAPID keys and store them', () => {
    service.initVapid('test@example.com');
    const publicKey = service.getVapidPublicKey();
    expect(publicKey).toBeDefined();
    expect(publicKey.length).toBeGreaterThan(0);
  });

  it('should reuse stored VAPID keys on second init', () => {
    service.initVapid('test@example.com');
    const key1 = service.getVapidPublicKey();

    // Create new service instance, same DB
    const service2 = new PushNotificationService(db);
    service2.initVapid('test@example.com');
    const key2 = service2.getVapidPublicKey();

    expect(key1).toBe(key2);
  });

  it('should throw if getVapidPublicKey called before init', () => {
    expect(() => service.getVapidPublicKey()).toThrow('VAPID keys not initialized');
  });

  it('should subscribe and list subscriptions', () => {
    const sub = service.subscribe(userId, {
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });

    expect(sub.id).toBeDefined();
    expect(sub.endpoint).toBe('https://push.example.com/sub1');

    const subs = service.getSubscriptions(userId);
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe('https://push.example.com/sub1');
  });

  it('should replace subscription with same endpoint', () => {
    service.subscribe(userId, {
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'old-key', auth: 'old-auth' },
    });
    service.subscribe(userId, {
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'new-key', auth: 'new-auth' },
    });

    const subs = service.getSubscriptions(userId);
    expect(subs).toHaveLength(1);
    expect(subs[0].p256dh).toBe('new-key');
  });

  it('should unsubscribe', () => {
    service.subscribe(userId, {
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'test', auth: 'test' },
    });

    const result = service.unsubscribe(userId, 'https://push.example.com/sub1');
    expect(result).toBe(true);

    const subs = service.getSubscriptions(userId);
    expect(subs).toHaveLength(0);
  });

  it('should return false when unsubscribing non-existent endpoint', () => {
    const result = service.unsubscribe(userId, 'https://nonexistent.com');
    expect(result).toBe(false);
  });

  it('should handle multiple subscriptions per user', () => {
    service.subscribe(userId, {
      endpoint: 'https://push.example.com/sub1',
      keys: { p256dh: 'key1', auth: 'auth1' },
    });
    service.subscribe(userId, {
      endpoint: 'https://push.example.com/sub2',
      keys: { p256dh: 'key2', auth: 'auth2' },
    });

    const subs = service.getSubscriptions(userId);
    expect(subs).toHaveLength(2);
  });
});
