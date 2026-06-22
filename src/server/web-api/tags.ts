import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { TagService } from '../../services/tags-groups.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  parseBody,
  getUserId,
} from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const createTagSchema = z.object({
  name: z.string().min(1, 'name is required'),
  color: z.string().optional(),
}).strict();

const updateTagSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
}).strict();

/**
 * Internal API router for tags, mounted at /web/api/tags.
 * Thin wrapper around TagService.
 */
export function createTagsRouter(db: Database.Database): Router {
  const router = Router();
  const tags = new TagService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // GET / — list all tags for the user.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    sendData(res, tags.list(userId));
  }));

  // POST / — create (or return existing by name).
  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(createTagSchema, req);
    const tag = tags.create(userId, input.name, input.color);
    sendData(res, tag, undefined, 201);
  }));

  // PATCH /:id
  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(updateTagSchema, req);
    const updated = tags.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Tag not found');
    sendData(res, updated);
  }));

  // DELETE /:id
  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const ok = tags.delete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Tag not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  return router;
}
