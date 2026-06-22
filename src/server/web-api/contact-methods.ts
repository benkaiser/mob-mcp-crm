import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService } from '../../services/contacts.js';
import { ContactMethodService } from '../../services/contact-methods.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const methodTypeEnum = z.enum([
  'email', 'phone', 'whatsapp', 'telegram', 'signal',
  'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other',
]);

const createMethodSchema = z.object({
  type: methodTypeEnum,
  value: z.string().min(1, 'value is required'),
  label: z.string().optional(),
  is_primary: z.boolean().optional(),
}).strict();

const updateMethodSchema = z.object({
  type: methodTypeEnum.optional(),
  value: z.string().min(1).optional(),
  label: z.string().optional(),
  is_primary: z.boolean().optional(),
}).strict();

/**
 * Internal API router for a contact's contact methods.
 * Mounted at /web/api/contacts; declares full paths including :contactId.
 */
export function createContactMethodsRouter(db: Database.Database): Router {
  const router = Router();
  const contacts = new ContactService(db);
  const methods = new ContactMethodService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  /** Verify the contact belongs to the user; throws 404 otherwise. */
  const requireContact = (userId: string, contactId: string): void => {
    if (!contacts.get(userId, contactId)) throw new ApiError(404, 'not_found', 'Contact not found');
  };

  router.get('/:contactId/methods', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    sendData(res, methods.listByContact(contactId));
  }));

  router.post('/:contactId/methods', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(createMethodSchema, req);
    const created = methods.add({ ...input, contact_id: contactId });
    sendData(res, created, undefined, 201);
  }));

  router.patch('/:contactId/methods/:methodId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(updateMethodSchema, req);
    const updated = methods.update(param(req.params.methodId), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Contact method not found');
    sendData(res, updated);
  }));

  router.delete('/:contactId/methods/:methodId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const ok = methods.remove(param(req.params.methodId));
    if (!ok) throw new ApiError(404, 'not_found', 'Contact method not found');
    sendData(res, { id: param(req.params.methodId), deleted: true });
  }));

  return router;
}
