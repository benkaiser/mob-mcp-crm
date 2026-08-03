import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { TaskService, type ListTasksOptions, type TaskStatus, type TaskPriority } from '../../services/tasks.js';
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

const priorityEnum = z.enum(['low', 'medium', 'high']);
const statusEnum = z.enum(['pending', 'in_progress', 'completed']);

const createTaskSchema = z.object({
  contact_id: z.string().optional(),
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: priorityEnum.optional(),
}).strict();

const updateTaskSchema = z.object({
  contact_id: z.string().nullable().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: priorityEnum.optional(),
  status: statusEnum.optional(),
}).strict();

/**
 * Internal API router for tasks, mounted at /web/api/tasks.
 * Thin wrapper around TaskService incl. complete lifecycle.
 */
export function createTasksRouter(db: Database.Database): Router {
  const router = Router();
  const tasks = new TaskService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // GET / - list with filters + pagination.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const options: ListTasksOptions = { page: p.page, per_page: p.perPage };
    if (typeof q.contact_id === 'string') options.contact_id = q.contact_id;
    if (typeof q.status === 'string') options.status = q.status as TaskStatus;
    if (typeof q.priority === 'string') options.priority = q.priority as TaskPriority;
    if (q.include_deleted === 'true') options.include_deleted = true;
    const result = tasks.list(userId, options);
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  // GET /:id
  router.get('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const task = tasks.get(userId, param(req.params.id));
    if (!task) throw new ApiError(404, 'not_found', 'Task not found');
    sendData(res, task);
  }));

  // POST /
  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(createTaskSchema, req);
    const task = tasks.create(userId, input);
    sendData(res, task, undefined, 201);
  }));

  // PATCH /:id
  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(updateTaskSchema, req);
    const updated = tasks.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Task not found');
    sendData(res, updated);
  }));

  // DELETE /:id - soft delete.
  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const ok = tasks.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Task not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  // POST /:id/restore
  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getUserId(req);
    try {
      sendData(res, tasks.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Task not found or not deleted');
    }
  }));

  // POST /:id/complete
  router.post('/:id/complete', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const task = tasks.complete(userId, param(req.params.id));
    if (!task) throw new ApiError(404, 'not_found', 'Task not found');
    sendData(res, task);
  }));

  return router;
}
