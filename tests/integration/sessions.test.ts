import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionService } from '../../src/services/sessions.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('SessionService', () => {
  let db: Database.Database;
  let service: SessionService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new SessionService(db);
    userId = createTestUser(db, { name: 'Alice', email: 'alice@example.com' });
  });

  afterEach(() => closeDatabase(db));

  it('creates a session and returns a token', () => {
    const token = service.create(userId);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
  });

  it('gets a session by token with joined user info', () => {
    const token = service.create(userId);
    const session = service.get(token);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(userId);
    expect(session!.userName).toBe('Alice');
    expect(session!.email).toBe('alice@example.com');
  });

  it('returns null for unknown token', () => {
    expect(service.get('does-not-exist')).toBeNull();
  });

  it('returns null for empty token', () => {
    expect(service.get('')).toBeNull();
  });

  it('stores user agent and ip metadata', () => {
    const token = service.create(userId, { userAgent: 'TestAgent/1.0', ip: '1.2.3.4' });
    const row = db.prepare('SELECT user_agent, ip FROM sessions WHERE token = ?').get(token) as any;
    expect(row.user_agent).toBe('TestAgent/1.0');
    expect(row.ip).toBe('1.2.3.4');
  });

  it('destroys a session', () => {
    const token = service.create(userId);
    service.destroy(token);
    expect(service.get(token)).toBeNull();
  });

  it('destroys all sessions for a user', () => {
    const t1 = service.create(userId);
    const t2 = service.create(userId);
    service.destroyAllForUser(userId);
    expect(service.get(t1)).toBeNull();
    expect(service.get(t2)).toBeNull();
  });

  it('treats an expired session as missing and removes it', () => {
    // TTL of 0 → already expired by the time we read it.
    const expiringService = new SessionService(db, -1000);
    const token = expiringService.create(userId);
    expect(expiringService.get(token)).toBeNull();
    const row = db.prepare('SELECT token FROM sessions WHERE token = ?').get(token);
    expect(row).toBeUndefined();
  });

  it('slides the expiry window on get', () => {
    const token = service.create(userId);
    const before = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token) as any;
    // Force an older expiry to observe the slide.
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
      .run(new Date(Date.now() + 60_000).toISOString(), token);
    const session = service.get(token);
    expect(session).not.toBeNull();
    const after = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token) as any;
    expect(new Date(after.expires_at).getTime()).toBeGreaterThan(new Date(before.expires_at).getTime() - 1000);
  });

  it('survives a simulated restart (new service instance, same db)', () => {
    const token = service.create(userId);
    const fresh = new SessionService(db);
    const session = fresh.get(token);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(userId);
  });

  it('cleans up expired sessions and reports the count', () => {
    const valid = service.create(userId);
    const expiring = new SessionService(db, -1000);
    expiring.create(userId);
    expiring.create(userId);
    const removed = service.cleanupExpired();
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(service.get(valid)).not.toBeNull();
  });

  it('cascades session deletion when the user is removed', () => {
    const token = service.create(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    const row = db.prepare('SELECT token FROM sessions WHERE token = ?').get(token);
    expect(row).toBeUndefined();
  });
});
