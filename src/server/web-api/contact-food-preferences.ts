import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService } from '../../services/contacts.js';
import { FoodPreferencesService } from '../../services/food-preferences.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const upsertFoodPreferencesSchema = z.object({
  dietary_restrictions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  favorite_foods: z.array(z.string()).optional(),
  disliked_foods: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).strict();

/**
 * Internal API router for a contact's food preferences (single record).
 * Mounted at /web/api/contacts; declares full paths including :contactId.
 */
export function createContactFoodPreferencesRouter(db: Database.Database): Router {
  const router = Router();
  const contacts = new ContactService(db);
  const food = new FoodPreferencesService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  const requireContact = (userId: string, contactId: string): void => {
    if (!contacts.get(userId, contactId)) throw new ApiError(404, 'not_found', 'Contact not found');
  };

  router.get('/:contactId/food-preferences', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    sendData(res, food.get(contactId));
  }));

  const upsert = asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(upsertFoodPreferencesSchema, req);
    const saved = food.upsert({ ...input, contact_id: contactId });
    sendData(res, saved);
  });

  router.put('/:contactId/food-preferences', upsert);
  router.patch('/:contactId/food-preferences', upsert);

  return router;
}
