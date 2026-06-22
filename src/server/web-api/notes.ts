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
  getUserId,
} from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const createNoteSchema = z.object({
  contact_id: z.string().min(1, 'contact_id is required'),
  title: z.string().optional(),
  body: z.string().min(1, 'body is required'),
  is_pinned: z.boolean().optional(),
}).strict();

const updateNoteSchema = createNoteSchema.partial();

/**
 * Internal API router for notes, mounted at /web/api/notes.
 * List is per-contact (requires ?contact_id=...). Pinned-first ordering
 * is preserved by the service. Thin wrapper around NoteService.
 */
export function createNotesRouter(db: Database.Database): Router {
  const router = Router();
  const notes = new NoteService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // GET /?contact_id=... — list a contact's notes (pinned first).
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
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

  // GET /:id
  router.get('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const note = notes.get(userId, param(req.params.id));
    if (!note) throw new ApiError(404, 'not_found', 'Note not found');
    sendData(res, note);
  }));

  // POST /
  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(createNoteSchema, req);
    try {
      const note = notes.create(userId, input);
      sendData(res, note, undefined, 201);
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  // PATCH /:id
  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(updateNoteSchema, req);
    const updated = notes.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Note not found');
    sendData(res, updated);
  }));

  // DELETE /:id — soft delete.
  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const ok = notes.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Note not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  // POST /:id/restore
  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getUserId(req);
    try {
      sendData(res, notes.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Note not found or not deleted');
    }
  }));

  return router;
}
