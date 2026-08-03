import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService } from '../../services/contacts.js';
import { RelationshipService, isDuplicateRelationshipError, isRelationshipTypeAllowedForUser } from '../../services/relationships.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

// ─── Validation schemas ─────────────────────────────────────────

const createRelationshipSchema = z.object({
  related_contact_id: z.string().min(1, 'related_contact_id is required'),
  relationship_type: z.string().min(1, 'relationship_type is required'),
  notes: z.string().optional(),
}).strict();

const updateRelationshipSchema = z.object({
  relationship_type: z.string().min(1).optional(),
  notes: z.string().optional(),
}).strict();

/**
 * Internal API router for a contact's relationships.
 * Mounted at /web/api/contacts; declares full paths including :contactId.
 */
export function createContactRelationshipsRouter(db: Database.Database): Router {
  const router = Router();
  const contacts = new ContactService(db);
  const relationships = new RelationshipService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  const requireContact = (userId: string, contactId: string): void => {
    if (!contacts.get(userId, contactId)) throw new ApiError(404, 'not_found', 'Contact not found');
  };

  const requireRelationshipType = (userId: string, type: string): void => {
    if (!isRelationshipTypeAllowedForUser(db, userId, type)) {
      throw new ApiError(422, 'validation_error', `Unknown relationship type "${type}"`);
    }
  };

  router.get('/:contactId/relationships', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    sendData(res, relationships.listByContact(contactId));
  }));

  router.post('/:contactId/relationships', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    // The related contact must also belong to the user.
    const input = parseBody(createRelationshipSchema, req);
    requireRelationshipType(userId, input.relationship_type);
    requireContact(userId, input.related_contact_id);
    let created;
    try {
      created = relationships.add({ ...input, contact_id: contactId });
    } catch (err) {
      if (isDuplicateRelationshipError(err)) {
        throw new ApiError(409, 'duplicate_relationship', err.message);
      }
      throw err;
    }
    sendData(res, created, undefined, 201);
  }));

  router.patch('/:contactId/relationships/:relationshipId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const input = parseBody(updateRelationshipSchema, req);
    if (input.relationship_type !== undefined) requireRelationshipType(userId, input.relationship_type);
    let updated;
    try {
      updated = relationships.updateForContact(contactId, param(req.params.relationshipId), input);
    } catch (err) {
      if (isDuplicateRelationshipError(err)) {
        throw new ApiError(409, 'duplicate_relationship', err.message);
      }
      throw err;
    }
    if (!updated) throw new ApiError(404, 'not_found', 'Relationship not found');
    sendData(res, updated);
  }));

  router.delete('/:contactId/relationships/:relationshipId', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const contactId = param(req.params.contactId);
    requireContact(userId, contactId);
    const ok = relationships.removeForContact(contactId, param(req.params.relationshipId));
    if (!ok) throw new ApiError(404, 'not_found', 'Relationship not found');
    sendData(res, { id: param(req.params.relationshipId), deleted: true });
  }));

  return router;
}
