import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { DebtService, type ListDebtsOptions, type DebtStatus } from '../../services/debts.js';
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

const debtDirectionEnum = z.enum(['i_owe_them', 'they_owe_me']);

const createDebtSchema = z.object({
  contact_id: z.string().min(1, 'contact_id is required'),
  amount: z.number(),
  currency: z.string().optional(),
  direction: debtDirectionEnum,
  reason: z.string().optional(),
  incurred_at: z.string().optional(),
}).strict();

const updateDebtSchema = createDebtSchema.partial();

/** Public REST API router for debts (mounted at /api/v1/debts). */
export function createDebtsRouter(db: Database.Database): Router {
  const router = Router();
  const debts = new DebtService(db);

  router.get('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const options: ListDebtsOptions = { page: p.page, per_page: p.perPage };
    if (typeof q.contact_id === 'string') options.contact_id = q.contact_id;
    if (typeof q.status === 'string') options.status = q.status as DebtStatus;
    if (q.include_deleted === 'true') options.include_deleted = true;
    const result = debts.list(userId, options);
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  router.get('/summary', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const q = req.query;
    if (typeof q.contact_id !== 'string' || q.contact_id.length === 0) {
      throw new ApiError(422, 'validation_error', 'contact_id query parameter is required');
    }
    try {
      sendData(res, debts.summary(userId, q.contact_id));
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const debt = debts.get(userId, param(req.params.id));
    if (!debt) throw new ApiError(404, 'not_found', 'Debt not found');
    sendData(res, debt);
  }));

  router.post('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(createDebtSchema, req);
    try {
      sendData(res, debts.create(userId, input), undefined, 201);
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(updateDebtSchema, req);
    const updated = debts.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Debt not found');
    sendData(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const ok = debts.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Debt not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    try {
      sendData(res, debts.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Debt not found or not deleted');
    }
  }));

  router.post('/:id/settle', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const debt = debts.settle(userId, param(req.params.id));
    if (!debt) throw new ApiError(404, 'not_found', 'Debt not found');
    sendData(res, debt);
  }));

  return router;
}
