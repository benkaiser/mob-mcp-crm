import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService } from '../../services/contacts.js';
import { AddressService } from '../../services/addresses.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const createAddressSchema = z.object({
  label: z.string().optional(),
  street_line_1: z.string().optional(),
  street_line_2: z.string().optional(),
  city: z.string().optional(),
  state_province: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
  is_primary: z.boolean().optional(),
}).strict();

const updateAddressSchema = createAddressSchema;

/**
 * Internal API router for a contact's addresses.
 * Mounted at /web/api/contacts; declares full paths including :contactId.
 */
export function createContactAddressesRouter(db: Database.Database): Router {
  const router = Router();
  const contacts = new ContactService(db);
  const addresses = new AddressService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  const requireContact = (userId: string, contactId: string): void => {
    if (!contacts.get(userId, contactId)) throw new ApiError(404, 'not_found', 'Contact not found');
  };

  router.get('/:contactId/addresses', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    sendData(res, addresses.listByContact(contactId));
  }));

  router.post('/:contactId/addresses', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(createAddressSchema, req);
    const created = addresses.add({ ...input, contact_id: contactId });
    sendData(res, created, undefined, 201);
  }));

  router.patch('/:contactId/addresses/:addressId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(updateAddressSchema, req);
    const updated = addresses.update(param(req.params.addressId), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Address not found');
    sendData(res, updated);
  }));

  router.delete('/:contactId/addresses/:addressId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const ok = addresses.remove(param(req.params.addressId));
    if (!ok) throw new ApiError(404, 'not_found', 'Address not found');
    sendData(res, { id: param(req.params.addressId), deleted: true });
  }));

  return router;
}
