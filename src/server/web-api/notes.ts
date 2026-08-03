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
 * Supports both per-contact note lists (?contact_id=..., pinned first) and
 * cross-contact overview/search lists. Thin wrapper around NoteService.
 */
export function createNotesRouter(db: Database.Database): Router {
  const router = Router();
  const notes = new NoteService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // GET / — list notes. With ?contact_id=... preserves pinned-first per-contact
  // ordering; without contact_id returns a cross-contact overview list.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const q = req.query;
    const p = pageParams(req);
    if (typeof q.contact_id === 'string' && q.contact_id.length > 0) {
      try {
        const result = notes.listByContact(userId, q.contact_id, {
          page: p.page,
          per_page: p.perPage,
          include_deleted: q.include_deleted === 'true',
        });
        sendData(res, result.data, pageMeta(result.total, p));
        return;
      } catch {
        throw new ApiError(404, 'not_found', 'Contact not found');
      }
    }

    const result = notes.searchNotes(userId, {
      query: typeof q.q === 'string' ? q.q : undefined,
      is_pinned: q.is_pinned === 'true' ? true : q.is_pinned === 'false' ? false : undefined,
      sort_by: q.sort_by === 'created_at' ? 'created_at' : 'updated_at',
      sort_order: q.sort_order === 'asc' ? 'asc' : 'desc',
      page: p.page,
      per_page: p.perPage,
    });
    sendData(res, result.data, pageMeta(result.total, p));
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
