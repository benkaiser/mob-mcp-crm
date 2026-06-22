import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { LifeEventService } from '../../services/life-events.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  parseBody,
  pageParams,
  pageMeta,
  param,
} from './helpers.js';
import { getApiUserId } from './middleware.js';

const createLifeEventSchema = z.object({
  contact_id: z.string().min(1, 'contact_id is required'),
  event_type: z.string().min(1, 'event_type is required'),
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  occurred_at: z.string().optional(),
  related_contact_ids: z.array(z.string()).optional(),
}).strict();

const updateLifeEventSchema = createLifeEventSchema.partial();

/** Public REST API router for life events (mounted at /api/v1/life-events). */
export function createLifeEventsRouter(db: Database.Database): Router {
  const router = Router();
  const lifeEvents = new LifeEventService(db);

  router.get('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const q = req.query;
    if (typeof q.contact_id !== 'string' || q.contact_id.length === 0) {
      throw new ApiError(422, 'validation_error', 'contact_id query parameter is required');
    }
    const p = pageParams(req);
    try {
      const result = lifeEvents.listByContact(userId, q.contact_id, {
        page: p.page,
        per_page: p.perPage,
        include_deleted: q.include_deleted === 'true',
      });
      sendData(res, result.data, pageMeta(result.total, p));
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const event = lifeEvents.get(userId, param(req.params.id));
    if (!event) throw new ApiError(404, 'not_found', 'Life event not found');
    sendData(res, event);
  }));

  router.post('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(createLifeEventSchema, req);
    try {
      sendData(res, lifeEvents.create(userId, input), undefined, 201);
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(updateLifeEventSchema, req);
    const updated = lifeEvents.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Life event not found');
    sendData(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const ok = lifeEvents.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Life event not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    try {
      sendData(res, lifeEvents.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Life event not found or not deleted');
    }
  }));

  return router;
}
