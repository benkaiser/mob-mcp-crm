import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  CustomRelationshipTypeService,
  getCanonicalRelationshipTypeOptions,
} from '../../services/relationships.js';
import { asyncHandler, sendData, ApiError, parseBody, getUserId } from './helpers.js';

const createSchema = z.object({
  value: z.string().min(1, 'value is required'),
  label: z.string().optional(),
  inverse_value: z.string().min(1, 'inverse_value is required'),
}).strict();

const updateSchema = z.object({
  value: z.string().min(1).optional(),
  label: z.string().nullable().optional(),
  inverse_value: z.string().min(1).optional(),
}).strict();

export function createRelationshipTypesRouter(db: Database.Database, forgetful: boolean): Router {
  const router = Router();
  const service = new CustomRelationshipTypeService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));
  const requirePersistent = () => {
    if (forgetful) throw new ApiError(400, 'unavailable', 'Custom relationship types are not available in forgetful mode');
  };

  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    sendData(res, forgetful ? getCanonicalRelationshipTypeOptions() : service.mergedList(userId));
  }));

  router.get('/custom', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    sendData(res, service.list(userId));
  }));

  router.post('/custom', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(createSchema, req);
    let created;
    try {
      created = service.create(userId, input);
    } catch (err) {
      throw new ApiError(400, 'invalid_relationship_type', (err as Error).message);
    }
    sendData(res, created, undefined, 201);
  }));

  router.patch('/custom/:id', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(updateSchema, req);
    let updated;
    try {
      updated = service.update(userId, param(req.params.id), input);
    } catch (err) {
      throw new ApiError(400, 'invalid_relationship_type', (err as Error).message);
    }
    if (!updated) throw new ApiError(404, 'not_found', 'Custom relationship type not found');
    sendData(res, updated);
  }));

  router.delete('/custom/:id', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const id = param(req.params.id);
    const ok = service.delete(userId, id);
    if (!ok) throw new ApiError(404, 'not_found', 'Custom relationship type not found');
    sendData(res, { id, deleted: true });
  }));

  return router;
}
