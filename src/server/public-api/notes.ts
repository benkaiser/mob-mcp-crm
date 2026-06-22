import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { NoteService } from '../../services/notes.js';
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

const createNoteSchema = z.object({
  contact_id: z.string().min(1, 'contact_id is required'),
  title: z.string().optional(),
  body: z.string().min(1, 'body is required'),
  is_pinned: z.boolean().optional(),
}).strict();

const updateNoteSchema = createNoteSchema.partial();

/** Public REST API router for notes (mounted at /api/v1/notes). */
export function createNotesRouter(db: Database.Database): Router {
  const router = Router();
  const notes = new NoteService(db);

  // GET /search?query=... — full-text search across the user's notes (BEFORE /:id).
  router.get('/search', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const result = notes.searchNotes(userId, {
      query: typeof q.query === 'string' ? q.query : undefined,
      tag_name: typeof q.tag_name === 'string' ? q.tag_name : undefined,
      contact_id: typeof q.contact_id === 'string' ? q.contact_id : undefined,
      is_pinned: q.is_pinned === undefined ? undefined : q.is_pinned === 'true',
      page: p.page,
      per_page: p.perPage,
    });
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  // GET /?contact_id=... — list a contact's notes (pinned first).
  router.get('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const q = req.query;
    if (typeof q.contact_id !== 'string' || q.contact_id.length === 0) {
      throw new ApiError(422, 'validation_error', 'contact_id query parameter is required');
    }
    const p = pageParams(req);
    try {
      const result = notes.listByContact(userId, q.contact_id, {
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
    const note = notes.get(userId, param(req.params.id));
    if (!note) throw new ApiError(404, 'not_found', 'Note not found');
    sendData(res, note);
  }));

  router.post('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(createNoteSchema, req);
    try {
      sendData(res, notes.create(userId, input), undefined, 201);
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(updateNoteSchema, req);
    const updated = notes.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Note not found');
    sendData(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const ok = notes.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Note not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    try {
      sendData(res, notes.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Note not found or not deleted');
    }
  }));

  return router;
}
