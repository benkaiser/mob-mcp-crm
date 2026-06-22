import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createHmac } from 'node:crypto';
import { WebhookService, type FetchImpl } from '../../src/services/webhooks.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** A fetch stub that records calls and returns a configurable status. */
function makeFetchStub(status = 200) {
  const calls: Captured[] = [];
  const impl: FetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { status, ok: status >= 200 && status < 300 };
  };
  return { impl, calls };
}

describe('WebhookService', () => {
  let db: Database.Database;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  describe('CRUD', () => {
    it('creates, lists, updates and soft-deletes a webhook', () => {
      const service = new WebhookService(db);

      const hook = service.create(userId, {
        url: 'https://example.com/hook',
        events: ['contact.created', 'reminder.due'],
      });
      expect(hook.id).toBeTruthy();
      expect(hook.url).toBe('https://example.com/hook');
      expect(hook.events).toBe('contact.created,reminder.due');
      expect(hook.secret).toBeTruthy();
      expect(hook.secret.length).toBeGreaterThanOrEqual(32);
      expect(hook.active).toBe(1);

      const list = service.list(userId);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(hook.id);

      const fetched = service.get(userId, hook.id);
      expect(fetched?.id).toBe(hook.id);

      const updated = service.update(userId, hook.id, { events: '*', active: false });
      expect(updated?.events).toBe('*');
      expect(updated?.active).toBe(0);
      expect(updated?.updated_at).toBeTruthy();

      expect(service.softDelete(userId, hook.id)).toBe(true);
      expect(service.get(userId, hook.id)).toBeNull();
      expect(service.list(userId)).toHaveLength(0);
    });

    it('uses a provided secret when supplied', () => {
      const service = new WebhookService(db);
      const hook = service.create(userId, {
        url: 'https://example.com/hook',
        events: '*',
        secret: 'my-fixed-secret',
      });
      expect(hook.secret).toBe('my-fixed-secret');
    });
  });

  describe('dispatch', () => {
    it('writes a delivery row and a correct HMAC signature header', async () => {
      const { impl, calls } = makeFetchStub(200);
      const service = new WebhookService(db, impl);

      const hook = service.create(userId, {
        url: 'https://example.com/hook',
        events: 'contact.created',
        secret: 'sekret',
      });

      await service.dispatch(userId, 'contact.created', { id: 'c1', name: 'Alice' });

      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call.url).toBe('https://example.com/hook');

      // Recompute the signature over the exact raw body that was sent.
      const expected = 'sha256=' + createHmac('sha256', 'sekret').update(call.body).digest('hex');
      expect(call.headers['X-Mob-Signature']).toBe(expected);

      const parsed = JSON.parse(call.body);
      expect(parsed.event).toBe('contact.created');
      expect(parsed.data).toEqual({ id: 'c1', name: 'Alice' });
      expect(parsed.timestamp).toBeTruthy();

      const deliveries = service.listDeliveries(userId, hook.id, {});
      expect(deliveries.total).toBe(1);
      expect(deliveries.data[0].status).toBe('success');
      expect(deliveries.data[0].response_status).toBe(200);
      expect(deliveries.data[0].attempts).toBe(1);
    });

    it('filters events: a contact.created subscriber does not get reminder.due', async () => {
      const { impl, calls } = makeFetchStub(200);
      const service = new WebhookService(db, impl);

      const hook = service.create(userId, {
        url: 'https://example.com/hook',
        events: 'contact.created',
        secret: 's',
      });

      await service.dispatch(userId, 'reminder.due', { id: 'r1' });
      expect(calls).toHaveLength(0);
      expect(service.listDeliveries(userId, hook.id, {}).total).toBe(0);

      await service.dispatch(userId, 'contact.created', { id: 'c1' });
      expect(calls).toHaveLength(1);
    });

    it('wildcard subscribers receive every event', async () => {
      const { impl, calls } = makeFetchStub(200);
      const service = new WebhookService(db, impl);

      service.create(userId, { url: 'https://example.com/all', events: '*', secret: 's' });

      await service.dispatch(userId, 'contact.created', { id: 'c1' });
      await service.dispatch(userId, 'reminder.due', { id: 'r1' });
      await service.dispatch(userId, 'activity.created', { id: 'a1' });

      expect(calls).toHaveLength(3);
    });

    it('does not throw when the transport fails (fire-and-forget safe)', async () => {
      const throwingFetch: FetchImpl = async () => { throw new Error('network down'); };
      const service = new WebhookService(db, throwingFetch);

      const hook = service.create(userId, { url: 'https://example.com/hook', events: '*', secret: 's' });

      await expect(service.dispatch(userId, 'contact.created', { id: 'c1' })).resolves.toBeUndefined();

      const deliveries = service.listDeliveries(userId, hook.id, {});
      expect(deliveries.data[0].status).toBe('failed');
      expect(deliveries.data[0].next_retry_at).toBeTruthy();
    });
  });

  describe('failure & retry', () => {
    it('marks failed on 500, sets next_retry_at, and retries succeed', async () => {
      // First a failing fetch.
      const failing = makeFetchStub(500);
      const service = new WebhookService(db, failing.impl);

      const hook = service.create(userId, {
        url: 'https://example.com/hook',
        events: '*',
        secret: 's',
      });

      await service.dispatch(userId, 'contact.created', { id: 'c1' });

      let delivery = service.listDeliveries(userId, hook.id, {}).data[0];
      expect(delivery.status).toBe('failed');
      expect(delivery.response_status).toBe(500);
      expect(delivery.attempts).toBe(1);
      expect(delivery.next_retry_at).toBeTruthy();

      // Force the retry window into the past so processRetries picks it up.
      db.prepare("UPDATE webhook_deliveries SET next_retry_at = datetime('now', '-1 minute') WHERE id = ?")
        .run(delivery.id);

      // Swap in a succeeding fetch for the retry.
      const succeeding = makeFetchStub(200);
      (service as unknown as { fetchImpl: FetchImpl }).fetchImpl = succeeding.impl;

      const processed = await service.processRetries();
      expect(processed).toBe(1);
      expect(succeeding.calls).toHaveLength(1);

      delivery = service.listDeliveries(userId, hook.id, {}).data[0];
      expect(delivery.status).toBe('success');
      expect(delivery.response_status).toBe(200);
      expect(delivery.attempts).toBe(2);
      expect(delivery.next_retry_at).toBeNull();
    });

    it('does not process retries whose next_retry_at is in the future', async () => {
      const failing = makeFetchStub(500);
      const service = new WebhookService(db, failing.impl);
      service.create(userId, { url: 'https://example.com/hook', events: '*', secret: 's' });

      await service.dispatch(userId, 'contact.created', { id: 'c1' });

      const processed = await service.processRetries();
      expect(processed).toBe(0);
    });
  });

  describe('verifySignature', () => {
    it('round-trips a generated signature', () => {
      const secret = 'top-secret';
      const body = JSON.stringify({ event: 'contact.created', data: { id: 'c1' }, timestamp: 't' });
      const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

      expect(WebhookService.verifySignature(secret, body, sig)).toBe(true);
      expect(WebhookService.verifySignature('wrong', body, sig)).toBe(false);
      expect(WebhookService.verifySignature(secret, body, 'sha256=deadbeef')).toBe(false);
      expect(WebhookService.verifySignature(secret, body, '')).toBe(false);
    });
  });
});
