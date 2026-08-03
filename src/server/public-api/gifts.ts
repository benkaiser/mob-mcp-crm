import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { GiftService, type ListGiftsOptions, type GiftStatus, type GiftDirection } from '../../services/gifts.js';
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

const giftStatusEnum = z.enum(['idea', 'planned', 'purchased', 'given', 'received']);
const giftDirectionEnum = z.enum(['giving', 'receiving']);

const createGiftSchema = z.object({
  contact_id: z.string().min(1, 'contact_id is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  url: z.string().optional(),
  estimated_cost: z.number().optional(),
  currency: z.string().optional(),
  occasion: z.string().optional(),
  status: giftStatusEnum.optional(),
  direction: giftDirectionEnum,
  date: z.string().optional(),
}).strict();

const updateGiftSchema = createGiftSchema.partial();

/** Public REST API router for gifts (mounted at /api/v1/gifts). */
export function createGiftsRouter(db: Database.Database): Router {
  const router = Router();
  const gifts = new GiftService(db);

  // GET /stats - cross-contact tracker with summary aggregation (BEFORE /:id).
  router.get('/stats', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const result = gifts.getGiftTracker(userId, {
      status: typeof q.status === 'string' ? (q.status as GiftStatus) : undefined,
      direction: typeof q.direction === 'string' ? (q.direction as GiftDirection) : undefined,
      occasion: typeof q.occasion === 'string' ? q.occasion : undefined,
      page: p.page,
      per_page: p.perPage,
    });
    sendData(res, result.data, { ...pageMeta(result.total, p), summary: result.summary });
  }));

  router.get('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const p = pageParams(req);
    const q = req.query;
    const options: ListGiftsOptions = { page: p.page, per_page: p.perPage };
    if (typeof q.contact_id === 'string') options.contact_id = q.contact_id;
    if (typeof q.status === 'string') options.status = q.status as GiftStatus;
    if (typeof q.direction === 'string') options.direction = q.direction as GiftDirection;
    if (q.include_deleted === 'true') options.include_deleted = true;
    const result = gifts.list(userId, options);
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  router.get('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const gift = gifts.get(userId, param(req.params.id));
    if (!gift) throw new ApiError(404, 'not_found', 'Gift not found');
    sendData(res, gift);
  }));

  router.post('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(createGiftSchema, req);
    try {
      sendData(res, gifts.create(userId, input), undefined, 201);
    } catch {
      throw new ApiError(404, 'not_found', 'Contact not found');
    }
  }));

  router.patch('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const input = parseBody(updateGiftSchema, req);
    const updated = gifts.update(userId, param(req.params.id), input);
    if (!updated) throw new ApiError(404, 'not_found', 'Gift not found');
    sendData(res, updated);
  }));

  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const ok = gifts.softDelete(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Gift not found');
    sendData(res, { id: param(req.params.id), deleted: true });
  }));

  router.post('/:id/restore', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    try {
      sendData(res, gifts.restore(userId, param(req.params.id)));
    } catch {
      throw new ApiError(404, 'not_found', 'Gift not found or not deleted');
    }
  }));

  return router;
}
