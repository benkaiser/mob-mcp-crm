import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService } from '../../services/contacts.js';
import { CustomFieldService } from '../../services/custom-fields.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const createCustomFieldSchema = z.object({
  field_name: z.string().min(1, 'field_name is required'),
  field_value: z.string(),
  field_group: z.string().optional(),
}).strict();

const updateCustomFieldSchema = z.object({
  field_name: z.string().min(1).optional(),
  field_value: z.string().optional(),
  field_group: z.string().optional(),
}).strict();

/**
 * Internal API router for a contact's custom fields.
 * Mounted at /web/api/contacts; declares full paths including :contactId.
 */
export function createContactCustomFieldsRouter(db: Database.Database): Router {
  const router = Router();
  const contacts = new ContactService(db);
  const customFields = new CustomFieldService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  const requireContact = (userId: string, contactId: string): void => {
    if (!contacts.get(userId, contactId)) throw new ApiError(404, 'not_found', 'Contact not found');
  };

  router.get('/:contactId/custom-fields', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    sendData(res, customFields.listByContact(contactId));
  }));

  router.post('/:contactId/custom-fields', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(createCustomFieldSchema, req);
    const created = customFields.add({ ...input, contact_id: contactId });
    sendData(res, created, undefined, 201);
  }));

  router.patch('/:contactId/custom-fields/:fieldId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(updateCustomFieldSchema, req);
    const updated = customFields.update(param(req.params.fieldId), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Custom field not found');
    sendData(res, updated);
  }));

  router.delete('/:contactId/custom-fields/:fieldId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const ok = customFields.remove(param(req.params.fieldId));
    if (!ok) throw new ApiError(404, 'not_found', 'Custom field not found');
    sendData(res, { id: param(req.params.fieldId), deleted: true });
  }));

  return router;
}
