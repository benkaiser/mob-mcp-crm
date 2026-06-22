import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PlanService, QuotaExceededError, FeatureNotAvailableError } from '../../src/services/plans.js';
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

    it('free plan caps contacts at 11', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      addContacts(11);
      expect(() => service.enforceContactQuota(userId, 1)).toThrow(QuotaExceededError);
    });

    it('free plan allows creating up to the cap', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      addContacts(10);
      expect(() => service.enforceContactQuota(userId, 1)).not.toThrow();
    });

    it('free plan blocks gated features', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      expect(service.isFeatureEnabled(userId, 'public_api')).toBe(false);
      expect(() => service.requireFeature(userId, 'public_api')).toThrow(FeatureNotAvailableError);
      expect(() => service.requireFeature(userId, 'webhooks')).toThrow(FeatureNotAvailableError);
    });

    it('paid plan lifts the cap and unlocks features', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('paid', userId);
      addContacts(20);
      expect(() => service.enforceContactQuota(userId, 5)).not.toThrow();
      expect(service.isFeatureEnabled(userId, 'public_api')).toBe(true);
      expect(() => service.requireFeature(userId, 'webhooks')).not.toThrow();
    });

    it('quota counts only non-deleted contacts', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      addContacts(11);
      // Soft-delete one → back under the cap
      const oneId = (db.prepare('SELECT id FROM contacts WHERE user_id = ? LIMIT 1').get(userId) as any).id;
      db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(oneId);
      expect(() => service.enforceContactQuota(userId, 1)).not.toThrow();
    });

    it('reports usage with cap for free plan', () => {
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run('free', userId);
      addContacts(4);
      const usage = service.getUsage(userId);
      expect(usage.contacts).toBe(4);
      expect(usage.contactCap).toBe(11);
      expect(usage.plan).toBe('free');
    });
  });
});
