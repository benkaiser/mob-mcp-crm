import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService } from '../../services/contacts.js';
import { TagService } from '../../services/tags-groups.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const tagContactSchema = z.object({
  name: z.string().min(1, 'name is required'),
  color: z.string().optional(),
}).strict();

/**
 * Internal API router for a contact's tag assignments.
 * Mounted at /web/api/contacts; declares full paths including :contactId.
 */
export function createContactTagsRouter(db: Database.Database): Router {
  const router = Router();
  const contacts = new ContactService(db);
  const tags = new TagService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  const requireContact = (userId: string, contactId: string): void => {
    if (!contacts.get(userId, contactId)) throw new ApiError(404, 'not_found', 'Contact not found');
  };

  router.get('/:contactId/tags', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    sendData(res, tags.listByContact(contactId));
  }));

  router.post('/:contactId/tags', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(tagContactSchema, req);
    const tag = tags.tagContact(userId, contactId, input.name, input.color);
    sendData(res, tag, undefined, 201);
  }));

  router.delete('/:contactId/tags/:tagId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const ok = tags.untagContact(contactId, param(req.params.tagId));
    if (!ok) throw new ApiError(404, 'not_found', 'Tag assignment not found');
    sendData(res, { id: param(req.params.tagId), deleted: true });
  }));

  return router;
}
