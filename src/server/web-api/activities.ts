import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  ActivityService,
  ActivityTypeService,
  type ListActivitiesOptions,
  type ActivityInteractionType,
} from '../../services/activities.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  parseBody,
  pageParams,
  pageMeta,
  getUserId,
} from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const interactionTypeEnum = z.enum([
  'phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other',
]);

const createActivitySchema = z.object({
  type: interactionTypeEnum,
  title: z.string().optional(),
  description: z.string().optional(),
  occurred_at: z.string().min(1, 'occurred_at is required'),
  duration_minutes: z.number().int().optional(),
  location: z.string().optional(),
  activity_type_id: z.string().optional(),
  participant_contact_ids: z.array(z.string()),
}).strict();

const updateActivitySchema = createActivitySchema.partial();

const createActivityTypeSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category: z.string().optional(),
  icon: z.string().optional(),
}).strict();

const updateActivityTypeSchema = createActivityTypeSchema.partial();

/**
 * Internal API router for activities, mounted at /web/api/activities.
 * Activity types live under /web/api/activities/types.
 * Thin wrapper around ActivityService/ActivityTypeService; userId from session.
 */
export function createActivitiesRouter(db: Database.Database): Router {
  const router = Router();
  const activities = new ActivityService(db);
  const types = new ActivityTypeService(db);

  /** Read a single route param as a string. */
  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // ─── Activity types (registered BEFORE /:id so /types doesn't match :id) ──

  router.get('/types', asyncHandler((req, res) => {
    const userId = getUserId(req);
    sendData(res, types.list(userId));
  }));

  router.post('/types', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(createActivityTypeSchema, req);
    const created = types.create(userId, input.name, input.category, input.icon);
    sendData(res, created, undefined, 201);
  }));

  router.patch('/types/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(updateActivityTypeSchema, req);
    const updated = types.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Activity type not found');
    sendData(res, updated);
  }));

  router.delete('/types/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const result = types.delete(userId, param(req.params.id));
    if (!result.deleted) throw new ApiError(404, 'not_found', 'Activity type not found');
    sendData(res, { id: param(req.params.id), deleted: true, ...(result.warning ? { warning: result.warning } : {}) });
  }));

  // ─── Activities ──────────────────────────────────────────────

  // GET / — list with filters + pagination.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const options: ListActivitiesOptions = { page: p.page, per_page: p.perPage };
    if (typeof q.contact_id === 'string') options.contact_id = q.contact_id;
    if (typeof q.type === 'string') options.type = q.type as ActivityInteractionType;
    if (q.include_deleted === 'true') options.include_deleted = true;
    const result = activities.list(userId, options);
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  // GET /:id
  router.get('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const activity = activities.get(userId, param(req.params.id));
    if (!activity) throw new ApiError(404, 'not_found', 'Activity not found');
    sendData(res, activity);
  }));

  // POST /
  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(createActivitySchema, req);
    const activity = activities.create(userId, input);
    sendData(res, activity, undefined, 201);
  }));

  // PATCH /:id
  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(updateActivitySchema, req);
    const updated = activities.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Activity not found');
    sendData(res, updated);
  }));

  // DELETE /:id — soft delete.
  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const ok = activities.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Activity not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  // POST /:id/restore
  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getUserId(req);
    try {
      sendData(res, activities.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Activity not found or not deleted');
    }
  }));

  return router;
}
