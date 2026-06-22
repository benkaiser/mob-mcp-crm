import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ReminderService, type ListRemindersOptions, type ReminderStatus } from '../../services/reminders.js';
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

const frequencyEnum = z.enum(['one_time', 'weekly', 'monthly', 'yearly']);

const createReminderSchema = z.object({
  contact_id: z.string().min(1, 'contact_id is required'),
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  reminder_date: z.string().min(1, 'reminder_date is required'),
  frequency: frequencyEnum.optional(),
}).strict();

const updateReminderSchema = createReminderSchema.partial();

const snoozeSchema = z.object({ new_date: z.string().min(1, 'new_date is required') }).strict();

/**
 * Internal API router for reminders, mounted at /web/api/reminders.
 * Thin wrapper around ReminderService incl. lifecycle (complete/snooze/dismiss).
 */
export function createRemindersRouter(db: Database.Database): Router {
  const router = Router();
  const reminders = new ReminderService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // GET / — list with filters + pagination.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const options: ListRemindersOptions = { page: p.page, per_page: p.perPage };
    if (typeof q.contact_id === 'string') options.contact_id = q.contact_id;
    if (typeof q.status === 'string') options.status = q.status as ReminderStatus;
    if (q.include_deleted === 'true') options.include_deleted = true;
    const result = reminders.list(userId, options);
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  // GET /:id
  router.get('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const reminder = reminders.get(userId, param(req.params.id));
    if (!reminder) throw new ApiError(404, 'not_found', 'Reminder not found');
    sendData(res, reminder);
  }));

  // POST /
  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(createReminderSchema, req);
    try {
      const reminder = reminders.create(userId, input);
      sendData(res, reminder, undefined, 201);
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  // PATCH /:id
  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(updateReminderSchema, req);
    const updated = reminders.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Reminder not found');
    sendData(res, updated);
  }));

  // DELETE /:id — soft delete.
  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const ok = reminders.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Reminder not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  // POST /:id/restore
  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getUserId(req);
    try {
      sendData(res, reminders.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Reminder not found or not deleted');
    }
  }));

  // POST /:id/complete
  router.post('/:id/complete', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const reminder = reminders.complete(userId, param(req.params.id));
    if (!reminder) throw new ApiError(404, 'not_found', 'Reminder not found');
    sendData(res, reminder);
  }));

  // POST /:id/snooze — body { new_date }.
  router.post('/:id/snooze', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const { new_date } = parseBody(snoozeSchema, req);
    const reminder = reminders.snooze(userId, param(req.params.id), new_date);
    if (!reminder) throw new ApiError(404, 'not_found', 'Reminder not found');
    sendData(res, reminder);
  }));

  // POST /:id/dismiss
  router.post('/:id/dismiss', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const ok = reminders.dismiss(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Reminder not found');
    sendData(res, { id: param(req.params.id), dismissed: true });
  }));

  return router;
}
