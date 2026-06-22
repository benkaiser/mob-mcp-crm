import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { WebhookService } from '../../services/webhooks.js';
import type { PlanService } from '../../services/plans.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  parseBody,
  pageParams,
  pageMeta,
  getUserId,
} from './helpers.js';

const eventsSchema = z.union([z.literal('*'), z.array(z.string().min(1))]);

const createWebhookSchema = z.object({
  url: z.string().url('url must be a valid URL'),
  events: eventsSchema,
  secret: z.string().optional(),
}).strict();

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: eventsSchema.optional(),
  secret: z.string().optional(),
  active: z.boolean().optional(),
}).strict();

/**
 * Internal API router for webhook management, mounted at /web/api/webhooks.
 * Gated behind the `webhooks` feature: self-hosted = always allowed;
 * hosted = paid plans only (PlanService.requireFeature → 403 otherwise).
 */
export function createWebhooksRouter(db: Database.Database, planService: PlanService): Router {
  const router = Router();
  const webhooks = new WebhookService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'webhooks');
    sendData(res, webhooks.list(userId));
  }));

  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'webhooks');
    const input = parseBody(createWebhookSchema, req);
    const created = webhooks.create(userId, input);
    sendData(res, created, undefined, 201);
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'webhooks');
    const hook = webhooks.get(userId, param(req.params.id));
    if (!hook) throw new ApiError(404, 'not_found', 'Webhook not found');
    sendData(res, hook);
  }));

  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'webhooks');
    const input = parseBody(updateWebhookSchema, req);
    const updated = webhooks.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Webhook not found');
    sendData(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'webhooks');
    const ok = webhooks.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Webhook not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  // Delivery log for a webhook.
  router.get('/:id/deliveries', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'webhooks');
    const hook = webhooks.get(userId, param(req.params.id));
    if (!hook) throw new ApiError(404, 'not_found', 'Webhook not found');
    const p = pageParams(req);
    const result = webhooks.listDeliveries(userId, param(req.params.id), { page: p.page, per_page: p.perPage });
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  // Send a test event to verify delivery + signature.
  router.post('/:id/test', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'webhooks');
    const hook = webhooks.get(userId, param(req.params.id));
    if (!hook) throw new ApiError(404, 'not_found', 'Webhook not found');
    void webhooks.dispatch(userId, 'webhook.test', { message: 'Test event from Mob CRM', webhook_id: hook.id });
    sendData(res, { dispatched: true });
  }));

  return router;
}
