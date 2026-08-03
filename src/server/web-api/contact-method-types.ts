import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  ContactMethodTypeService,
  getBuiltInContactMethodTypeOptions,
} from '../../services/contact-method-types.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

const keySchema = z.string().trim().min(1, 'key is required');
const upsertSchema = z.object({
  key: keySchema,
  label: z.string().trim().min(1, 'label is required').optional(),
  link_template: z.string().nullable().optional(),
}).strict();
const updateSchema = z.object({
  key: keySchema.optional(),
  label: z.string().trim().min(1, 'label is required').optional(),
  link_template: z.string().nullable().optional(),
}).strict();

export function createContactMethodTypesRouter(db: Database.Database, forgetful: boolean): Router {
  const router = Router();
  const service = new ContactMethodTypeService(db);
  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));
  const requirePersistent = () => {
    if (forgetful) throw new ApiError(400, 'unavailable', 'Custom contact method types are not available in forgetful mode');
  };
  const wrapInvalid = (err: unknown): never => {
    throw new ApiError(400, 'invalid_contact_method_type', (err as Error).message);
  };

  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    sendData(res, forgetful ? getBuiltInContactMethodTypeOptions() : service.mergedList(userId));
  }));

  router.get('/custom', asyncHandler((req, res) => {
    requirePersistent();
    sendData(res, service.list(getUserId(req)));
  }));

  router.get('/:key', asyncHandler((req, res) => {
    requirePersistent();
    const row = service.get(getUserId(req), param(req.params.key));
    if (!row) throw new ApiError(404, 'not_found', 'Contact method type not found');
    sendData(res, row);
  }));

  router.post('/', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(upsertSchema, req);
    try {
      sendData(res, service.upsert(userId, input), undefined, 201);
    } catch (err) {
      wrapInvalid(err);
    }
  }));

  router.patch('/:key', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(updateSchema, req);
    try {
      const updated = service.update(userId, param(req.params.key), input);
      if (!updated) throw new ApiError(404, 'not_found', 'Contact method type not found');
      sendData(res, updated);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      wrapInvalid(err);
    }
  }));

  router.delete('/:key', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const key = param(req.params.key);
    const ok = service.delete(userId, key);
    if (!ok) throw new ApiError(404, 'not_found', 'Contact method type not found');
    sendData(res, { key, deleted: true });
  }));

  return router;
}
