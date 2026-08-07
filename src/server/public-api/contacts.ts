import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService, type ListContactsOptions } from '../../services/contacts.js';
import { getContactProfile } from '../../services/contact-profile.js';
import { ContactMethodService } from '../../services/contact-methods.js';
import { AddressService } from '../../services/addresses.js';
import { CustomFieldService } from '../../services/custom-fields.js';
import { FoodPreferencesService } from '../../services/food-preferences.js';
import { RelationshipService } from '../../services/relationships.js';
import { TagService } from '../../services/tags-groups.js';
import type { PlanService } from '../../services/plans.js';
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

// ─── Validation schemas ─────────────────────────────────────────

const birthdayModeEnum = z.enum(['full_date', 'month_day', 'approximate_age']);
const statusEnum = z.enum(['active', 'archived', 'deceased']);

const createContactSchema = z.object({
  first_name: z.string().min(1, 'first_name is required'),
  middle_name: z.string().optional(),
  last_name: z.string().optional(),
  nickname: z.string().optional(),
  maiden_name: z.string().optional(),
  gender: z.string().optional(),
  pronouns: z.string().optional(),
  avatar_url: z.string().optional(),
  birthday_mode: birthdayModeEnum.optional(),
  birthday_date: z.string().optional(),
  birthday_month: z.number().int().min(1).max(12).optional(),
  birthday_day: z.number().int().min(1).max(31).optional(),
  birthday_year_approximate: z.number().int().optional(),
  status: statusEnum.optional(),
  deceased_date: z.string().optional(),
  is_favorite: z.boolean().optional(),
  met_at_date: z.string().optional(),
  met_at_location: z.string().optional(),
  met_through_contact_id: z.string().optional(),
  met_description: z.string().optional(),
  job_title: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  work_notes: z.string().optional(),
}).strict();

const updateContactSchema = createContactSchema.partial();

const contactMethodTypeEnum = z.enum([
  'email', 'phone', 'whatsapp', 'telegram', 'signal',
  'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other',
]);

const createMethodSchema = z.object({
  type: contactMethodTypeEnum,
  value: z.string().min(1, 'value is required'),
  label: z.string().optional(),
  is_primary: z.boolean().optional(),
}).strict();
const updateMethodSchema = createMethodSchema.partial();

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

const createCustomFieldSchema = z.object({
  field_name: z.string().min(1, 'field_name is required'),
  field_value: z.string().min(1, 'field_value is required'),
  field_group: z.string().optional(),
}).strict();
const updateCustomFieldSchema = createCustomFieldSchema.partial();

const foodPreferencesSchema = z.object({
  dietary_restrictions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  favorite_foods: z.array(z.string()).optional(),
  disliked_foods: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).strict();

const createRelationshipSchema = z.object({
  related_contact_id: z.string().min(1, 'related_contact_id is required'),
  relationship_type: z.string().min(1, 'relationship_type is required'),
  notes: z.string().optional(),
}).strict();

const assignTagSchema = z.object({
  name: z.string().min(1, 'name is required'),
}).strict();

/**
 * Public REST API router for contacts (mounted at /api/v1/contacts).
 * Mirrors the internal web-api but uses bearer-derived userId + quota gating.
 * Sub-resources (methods, addresses, custom-fields, food-preferences,
 * relationships, tags) live under /contacts/:id.
 */
export function createContactsRouter(db: Database.Database, planService: PlanService): Router {
  const router = Router();
  const contacts = new ContactService(db);
  const methods = new ContactMethodService(db);
  const addresses = new AddressService(db);
  const customFields = new CustomFieldService(db);
  const foodPreferences = new FoodPreferencesService(db);
  const relationships = new RelationshipService(db);
  const tags = new TagService(db);

  /** Verify a contact belongs to the user, else 404. */
  const requireContact = (userId: string, contactId: string): void => {
    if (!contacts.get(userId, contactId)) throw new ApiError(404, 'not_found', 'Contact not found');
  };

  // ─── Contacts CRUD ───────────────────────────────────────────

  router.get('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const options: ListContactsOptions = { page: p.page, per_page: p.perPage };
    if (typeof q.status === 'string') options.status = q.status as ListContactsOptions['status'];
    if (q.is_favorite !== undefined) options.is_favorite = q.is_favorite === 'true' || q.is_favorite === '1';
    if (typeof q.search === 'string') options.search = q.search;
    if (typeof q.company === 'string') options.company = q.company;
    if (typeof q.tag_name === 'string') options.tag_name = q.tag_name;
    if (typeof q.sort_by === 'string') options.sort_by = q.sort_by as ListContactsOptions['sort_by'];
    if (typeof q.sort_order === 'string') options.sort_order = q.sort_order as ListContactsOptions['sort_order'];
    if (q.include_deleted === 'true') options.include_deleted = true;
    const result = contacts.list(userId, options);
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const profile = getContactProfile(db, userId, param(req.params.id));
    if (!profile) throw new ApiError(404, 'not_found', 'Contact not found');
    sendData(res, profile);
  }));

  router.post('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(createContactSchema, req);
    planService.enforceContactQuota(userId, 1);
    sendData(res, contacts.create(userId, input), undefined, 201);
  }));

  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(updateContactSchema, req);
    const updated = contacts.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Contact not found');
    sendData(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const ok = contacts.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Contact not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    try {
      sendData(res, contacts.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found or not deleted');
    }
  }));

  // ─── Contact methods ─────────────────────────────────────────

  router.get('/:id/methods', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    sendData(res, methods.listByContact(param(req.params.id)));
  }));

  router.post('/:id/methods', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(createMethodSchema, req);
    sendData(res, methods.add({ contact_id: param(req.params.id), ...input }), undefined, 201);
  }));

  router.patch('/:id/methods/:methodId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(updateMethodSchema, req);
    const updated = methods.updateForContact(param(req.params.id), param(req.params.methodId), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Contact method not found');
    sendData(res, updated);
  }));

  router.delete('/:id/methods/:methodId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const ok = methods.removeForContact(param(req.params.id), param(req.params.methodId));
    if (!ok) throw new ApiError(404, 'not_found', 'Contact method not found');
    sendData(res, { id: param(req.params.methodId), deleted: true });
  }));

  // ─── Addresses ───────────────────────────────────────────────

  router.get('/:id/addresses', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    sendData(res, addresses.listByContact(param(req.params.id)));
  }));

  router.post('/:id/addresses', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(createAddressSchema, req);
    sendData(res, addresses.add({ contact_id: param(req.params.id), ...input }), undefined, 201);
  }));

  router.patch('/:id/addresses/:addressId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(updateAddressSchema, req);
    const updated = addresses.updateForContact(param(req.params.id), param(req.params.addressId), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Address not found');
    sendData(res, updated);
  }));

  router.delete('/:id/addresses/:addressId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const ok = addresses.removeForContact(param(req.params.id), param(req.params.addressId));
    if (!ok) throw new ApiError(404, 'not_found', 'Address not found');
    sendData(res, { id: param(req.params.addressId), deleted: true });
  }));

  // ─── Custom fields ───────────────────────────────────────────

  router.get('/:id/custom-fields', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    sendData(res, customFields.listByContact(param(req.params.id)));
  }));

  router.post('/:id/custom-fields', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(createCustomFieldSchema, req);
    sendData(res, customFields.add({ contact_id: param(req.params.id), ...input }), undefined, 201);
  }));

  router.patch('/:id/custom-fields/:fieldId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(updateCustomFieldSchema, req);
    const updated = customFields.updateForContact(param(req.params.id), param(req.params.fieldId), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Custom field not found');
    sendData(res, updated);
  }));

  router.delete('/:id/custom-fields/:fieldId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const ok = customFields.removeForContact(param(req.params.id), param(req.params.fieldId));
    if (!ok) throw new ApiError(404, 'not_found', 'Custom field not found');
    sendData(res, { id: param(req.params.fieldId), deleted: true });
  }));

  // ─── Food preferences (singleton per contact) ────────────────

  router.get('/:id/food-preferences', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    sendData(res, foodPreferences.get(param(req.params.id)));
  }));

  router.put('/:id/food-preferences', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(foodPreferencesSchema, req);
    sendData(res, foodPreferences.upsert({ contact_id: param(req.params.id), ...input }));
  }));

  // ─── Relationships ───────────────────────────────────────────

  router.get('/:id/relationships', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    sendData(res, relationships.listByContact(param(req.params.id)));
  }));

  router.post('/:id/relationships', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(createRelationshipSchema, req);
    // Verify the related contact also belongs to the user.
    requireContact(userId, input.related_contact_id);
    try {
      const rel = relationships.add({ contact_id: param(req.params.id), ...input });
      sendData(res, rel, undefined, 201);
    } catch (err) {
      throw new ApiError(422, 'validation_error', (err as Error).message);
    }
  }));

  router.delete('/:id/relationships/:relationshipId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const ok = relationships.removeForContact(param(req.params.id), param(req.params.relationshipId));
    if (!ok) throw new ApiError(404, 'not_found', 'Relationship not found');
    sendData(res, { id: param(req.params.relationshipId), deleted: true });
  }));

  // ─── Tags (assign / unassign) ────────────────────────────────

  router.get('/:id/tags', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    sendData(res, tags.listByContact(param(req.params.id)));
  }));

  router.post('/:id/tags', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const input = parseBody(assignTagSchema, req);
    const tag = tags.tagContact(userId, param(req.params.id), input.name);
    sendData(res, tag, undefined, 201);
  }));

  router.delete('/:id/tags/:tagId', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    requireContact(userId, param(req.params.id));
    const ok = tags.untagContact(param(req.params.id), param(req.params.tagId));
    if (!ok) throw new ApiError(404, 'not_found', 'Tag assignment not found');
    sendData(res, { id: param(req.params.tagId), unassigned: true });
  }));

  return router;
}
