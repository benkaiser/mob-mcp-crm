import Database from 'better-sqlite3';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

/**
 * Supported outbound webhook event names. The parent (route layer) is
 * responsible for calling {@link WebhookService.dispatch} with one of these.
 * Subscribers may also use the wildcard `'*'` in their `events` list to
 * receive everything.
 */
export type WebhookEvent =
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'activity.created'
  | 'reminder.due'
  | 'task.created'
  | 'task.completed';

export interface Webhook {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: string; // comma-separated event names, or '*'
  active: number; // SQLite boolean (0/1)
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export type DeliveryStatus = 'pending' | 'success' | 'failed';

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: string;
  status: DeliveryStatus;
  response_status: number | null;
  attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[] | string; // array of event names, or '*'
  secret?: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[] | string;
  secret?: string;
  active?: boolean;
}

export interface ListDeliveriesOptions {
  page?: number;
  per_page?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

/** A minimal subset of the global `fetch` signature, for injection in tests. */
export type FetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; ok?: boolean }>;

// ─── Constants ──────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;

// ─── Helpers ────────────────────────────────────────────────────

function normalizeEvents(events: string[] | string): string {
  if (typeof events === 'string') return events.trim();
  return events.map((e) => e.trim()).filter(Boolean).join(',');
}

function computeSignature(secret: string, rawBody: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
}

// ─── Service ────────────────────────────────────────────────────

export class WebhookService {
  private fetchImpl: FetchImpl;

  constructor(
    private db: Database.Database,
    fetchImpl?: FetchImpl,
  ) {
    // Default to the global fetch (Node 20+). Bound so `this` is preserved.
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchImpl>);
  }

  // ── CRUD ──────────────────────────────────────────────────────

  create(userId: string, input: CreateWebhookInput): Webhook {
    const id = generateId();
    const secret = input.secret ?? randomBytes(32).toString('hex');
    const events = normalizeEvents(input.events);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO webhooks (id, user_id, url, secret, events, active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, userId, input.url, secret, events, now);

    return this.getById(userId, id)!;
  }

  list(userId: string): Webhook[] {
    return this.db.prepare(
      'SELECT * FROM webhooks WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
    ).all(userId) as Webhook[];
  }

  get(userId: string, id: string): Webhook | null {
    return this.getById(userId, id);
  }

  update(userId: string, id: string, patch: UpdateWebhookInput): Webhook | null {
    const existing = this.getById(userId, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.url !== undefined) { fields.push('url = ?'); values.push(patch.url); }
    if (patch.events !== undefined) { fields.push('events = ?'); values.push(normalizeEvents(patch.events)); }
    if (patch.secret !== undefined) { fields.push('secret = ?'); values.push(patch.secret); }
    if (patch.active !== undefined) { fields.push('active = ?'); values.push(patch.active ? 1 : 0); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id, userId);
      this.db.prepare(
        `UPDATE webhooks SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      ).run(...values);
    }

    return this.getById(userId, id);
  }

  softDelete(userId: string, id: string): boolean {
    const result = this.db.prepare(`
      UPDATE webhooks SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(id, userId);
    return result.changes > 0;
  }

  // ── Deliveries ────────────────────────────────────────────────

  listDeliveries(userId: string, webhookId: string, options: ListDeliveriesOptions = {}): PaginatedResult<WebhookDelivery> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    // Scope deliveries to webhooks owned by the user (join guards ownership).
    const countRow = this.db.prepare(`
      SELECT COUNT(*) AS count FROM webhook_deliveries d
      JOIN webhooks w ON w.id = d.webhook_id
      WHERE d.webhook_id = ? AND w.user_id = ?
    `).get(webhookId, userId) as { count: number };

    const rows = this.db.prepare(`
      SELECT d.* FROM webhook_deliveries d
      JOIN webhooks w ON w.id = d.webhook_id
      WHERE d.webhook_id = ? AND w.user_id = ?
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
    `).all(webhookId, userId, perPage, offset) as WebhookDelivery[];

    return { data: rows, total: countRow.count, page, per_page: perPage };
  }

  // ── Dispatch ──────────────────────────────────────────────────

  /**
   * Dispatch an event to all of the user's active, matching webhooks.
   *
   * Safe to call fire-and-forget: never throws. Each delivery is recorded in
   * `webhook_deliveries`; transport failures are caught and logged on the row.
   */
  async dispatch(userId: string, event: WebhookEvent | string, data: unknown): Promise<void> {
    let hooks: Webhook[];
    try {
      hooks = this.list(userId).filter((h) => h.active === 1 && this.matchesEvent(h.events, event));
    } catch (err) {
      console.error('[webhooks] failed to load webhooks for dispatch:', err);
      return;
    }

    const timestamp = new Date().toISOString();

    await Promise.all(hooks.map(async (hook) => {
      const rawBody = JSON.stringify({ event, data, timestamp });
      const deliveryId = generateId();
      this.db.prepare(`
        INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, attempts, created_at)
        VALUES (?, ?, ?, ?, 'pending', 0, ?)
      `).run(deliveryId, hook.id, event, rawBody, timestamp);

      await this.attemptDelivery(deliveryId, hook, rawBody);
    }));
  }

  /**
   * Re-attempt failed deliveries whose `next_retry_at <= now` and which have
   * not exhausted MAX_ATTEMPTS. Returns the number of deliveries processed.
   */
  async processRetries(): Promise<number> {
    const due = this.db.prepare(`
      SELECT d.* FROM webhook_deliveries d
      JOIN webhooks w ON w.id = d.webhook_id
      WHERE d.status = 'failed'
        AND d.attempts < ?
        AND d.next_retry_at IS NOT NULL
        AND datetime(d.next_retry_at) <= datetime('now')
        AND w.deleted_at IS NULL
        AND w.active = 1
    `).all(MAX_ATTEMPTS) as WebhookDelivery[];

    for (const delivery of due) {
      const hook = this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(delivery.webhook_id) as Webhook | undefined;
      if (!hook) continue;
      await this.attemptDelivery(delivery.id, hook, delivery.payload);
    }

    return due.length;
  }

  // ── Signature verification ────────────────────────────────────

  /**
   * Verify an `X-Mob-Signature` header (`sha256=<hex>`) against the raw body
   * using the webhook secret. Constant-time comparison.
   */
  static verifySignature(secret: string, rawBody: string, signatureHeader: string): boolean {
    const expected = computeSignature(secret, rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader ?? '');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // ── Internals ─────────────────────────────────────────────────

  private matchesEvent(subscribed: string, event: string): boolean {
    if (subscribed.trim() === '*') return true;
    const set = subscribed.split(',').map((e) => e.trim()).filter(Boolean);
    return set.includes('*') || set.includes(event);
  }

  /**
   * Perform a single HTTP delivery attempt and update the delivery row.
   * Never throws.
   */
  private async attemptDelivery(deliveryId: string, hook: Webhook, rawBody: string): Promise<void> {
    const signature = computeSignature(hook.secret, rawBody);

    // Read current attempts to compute the next backoff window.
    const current = this.db.prepare('SELECT attempts FROM webhook_deliveries WHERE id = ?')
      .get(deliveryId) as { attempts: number } | undefined;
    const attempts = (current?.attempts ?? 0) + 1;

    try {
      const res = await this.fetchImpl(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mob-Signature': signature,
          'X-Mob-Event': hook.events,
        },
        body: rawBody,
      });

      const status = res.status;
      const ok = status >= 200 && status < 300;

      if (ok) {
        this.db.prepare(`
          UPDATE webhook_deliveries
          SET status = 'success', response_status = ?, attempts = ?,
              last_attempt_at = datetime('now'), next_retry_at = NULL
          WHERE id = ?
        `).run(status, attempts, deliveryId);
      } else {
        this.markFailed(deliveryId, attempts, status);
      }
    } catch (err) {
      console.error(`[webhooks] delivery ${deliveryId} to ${hook.url} failed:`, err);
      this.markFailed(deliveryId, attempts, null);
    }
  }

  private markFailed(deliveryId: string, attempts: number, responseStatus: number | null): void {
    // Exponential backoff: attempts^2 minutes from now.
    const backoffMinutes = attempts * attempts;
    this.db.prepare(`
      UPDATE webhook_deliveries
      SET status = 'failed', response_status = ?, attempts = ?,
          last_attempt_at = datetime('now'),
          next_retry_at = datetime('now', ?)
      WHERE id = ?
    `).run(responseStatus, attempts, `+${backoffMinutes} minutes`, deliveryId);
  }

  private getById(userId: string, id: string): Webhook | null {
    const row = this.db.prepare(
      'SELECT * FROM webhooks WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    ).get(id, userId) as Webhook | undefined;
    return row ?? null;
  }
}
