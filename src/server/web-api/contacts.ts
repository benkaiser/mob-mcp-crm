import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ContactService, type ListContactsOptions } from '../../services/contacts.js';
import { getContactProfile } from '../../services/contact-profile.js';
import type { PlanService } from '../../services/plans.js';
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

const mergeContactSchema = z.object({
  secondary_id: z.string().min(1, 'secondary_id is required'),
}).strict();

/**
 * Internal API router for contacts, mounted at /web/api/contacts.
 * Thin wrapper around ContactService; userId always derived from the session.
 */
export function createContactsRouter(db: Database.Database, planService: PlanService): Router {
  const router = Router();
  const contacts = new ContactService(db);

  /** Read a single route param as a string. */
  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // GET / - list with filters, sort, pagination.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const options: ListContactsOptions = {
      page: p.page,
      per_page: p.perPage,
    };
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

  // GET /duplicates - potential duplicate pairs (registered before /:id).
  router.get('/duplicates', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const result = contacts.findDuplicates(userId);
    sendData(res, result.data, { total: result.total });
  }));

  // GET /:id - enriched profile payload.
  router.get('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const profile = getContactProfile(db, userId, param(req.params.id));
    if (!profile) throw new ApiError(404, 'not_found', 'Contact not found');
    sendData(res, profile);
  }));

  // POST / - create (quota-enforced).
  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(createContactSchema, req);
    planService.enforceContactQuota(userId, 1);
    const contact = contacts.create(userId, input);
    sendData(res, contact, undefined, 201);
  }));

  // PATCH /:id - partial update.
  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const input = parseBody(updateContactSchema, req);
    const updated = contacts.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Contact not found');
    sendData(res, updated);
  }));

  // DELETE /:id - soft delete.
  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const existing = contacts.get(userId, param(req.params.id));
    if (!existing) throw new ApiError(404, 'not_found', 'Contact not found');
    const ok = contacts.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Contact not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  // POST /:id/restore - restore a soft-deleted contact.
  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getUserId(req);
    try {
      const restored = contacts.restore(userId, param(req.params.id));
      sendData(res, restored);
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found or not deleted');
    }
  }));

  // POST /:id/merge - merge :secondaryId into :id (primary). Body { secondary_id }.
  router.post('/:id/merge', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const { secondary_id } = parseBody(mergeContactSchema, req);
    try {
      const result = contacts.merge(userId, param(req.params.id), secondary_id);
      sendData(res, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Merge failed';
      throw new ApiError(422, 'merge_failed', msg);
    }
  }));

  return router;
}
