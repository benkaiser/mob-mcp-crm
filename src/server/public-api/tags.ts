import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { TagService } from '../../services/tags-groups.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  parseBody,
  param,
} from './helpers.js';
import { getApiUserId } from './middleware.js';

const createTagSchema = z.object({
  name: z.string().min(1, 'name is required'),
  color: z.string().optional(),
}).strict();

const updateTagSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
}).strict();

/** Public REST API router for tags (mounted at /api/v1/tags). */
export function createTagsRouter(db: Database.Database): Router {
  const router = Router();
  const tags = new TagService(db);

  router.get('/', asyncHandler((req, res) => {
    sendData(res, tags.list(getApiUserId(req)));
  }));

  router.post('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(createTagSchema, req);
    sendData(res, tags.create(userId, input.name, input.color), undefined, 201);
  }));

  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(updateTagSchema, req);
    const updated = tags.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Tag not found');
    sendData(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const ok = tags.delete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Tag not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  return router;
}
