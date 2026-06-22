import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PlanService } from '../../src/services/plans.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('PlanService', () => {
  let db: Database.Database;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  function addContacts(n: number) {
    for (let i = 0; i < n; i++) createTestContact(db, userId, { firstName: `C${i}` });
  }

  describe('self-hosted mode (hosted = false)', () => {
    let service: PlanService;
    beforeEach(() => { service = new PlanService(db, false); });

    it('reports unlimited plan regardless of stored value', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      expect(service.getPlan(userId)).toBe('unlimited');
      expect(service.getEntitlements(userId).contactCap).toBeNull();
    });

    it('enables every feature', () => {
      expect(service.isFeatureEnabled(userId, 'public_api')).toBe(true);
      expect(service.isFeatureEnabled(userId, 'webhooks')).toBe(true);
      expect(service.isFeatureEnabled(userId, 'advanced_import')).toBe(true);
    });

    it('never enforces the contact quota', () => {
      addContacts(50);
      expect(() => service.enforceContactQuota(userId, 100)).not.toThrow();
    });

    it('requireFeature is a no-op', () => {
      expect(() => service.requireFeature(userId, 'public_api')).not.toThrow();
    });

    it('reports null contact cap in usage', () => {
      addContacts(3);
      const usage = service.getUsage(userId);
      expect(usage.contacts).toBe(3);
      expect(usage.contactCap).toBeNull();
      expect(usage.plan).toBe('unlimited');
    });
  });

  describe('hosted mode (hosted = true)', () => {
    let service: PlanService;
    beforeEach(() => { service = new PlanService(db, true); });

    it('defaults a user with unknown plan to free', () => {
      // default column value is 'unlimited'; simulate a hosted free signup
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      expect(service.getPlan(userId)).toBe('free');
    });

    it('beta free plan has no contact cap', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      addContacts(50);
      expect(() => service.enforceContactQuota(userId, 1)).not.toThrow();
    });

    it('beta free plan unlocks all features', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      expect(service.isFeatureEnabled(userId, 'public_api')).toBe(true);
      expect(() => service.requireFeature(userId, 'public_api')).not.toThrow();
      expect(() => service.requireFeature(userId, 'webhooks')).not.toThrow();
    });

    it('paid plan lifts the cap and unlocks features', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('paid', userId);
      addContacts(20);
      expect(() => service.enforceContactQuota(userId, 5)).not.toThrow();
      expect(service.isFeatureEnabled(userId, 'public_api')).toBe(true);
      expect(() => service.requireFeature(userId, 'webhooks')).not.toThrow();
    });

    it('quota remains a no-op even with deleted contacts', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      addContacts(11);
      const oneId = (db.prepare('SELECT id FROM contacts WHERE user_id = ? LIMIT 1').get(userId) as any).id;
      db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(oneId);
      expect(() => service.enforceContactQuota(userId, 1)).not.toThrow();
    });

    it('reports uncapped usage for free plan during beta', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      addContacts(4);
      const usage = service.getUsage(userId);
      expect(usage.contacts).toBe(4);
      expect(usage.contactCap).toBeNull();
      expect(usage.plan).toBe('free');
    });
  });
});
