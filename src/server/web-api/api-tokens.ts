import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ApiTokenService } from '../../services/api-tokens.js';
import type { PlanService } from '../../services/plans.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  parseBody,
  getUserId,
} from './helpers.js';

const createTokenSchema = z.object({
  name: z.string().min(1, 'name is required'),
  scopes: z.string().optional(),
}).strict();

/**
 * Internal API router for API token management, mounted at /web/api/tokens.
 * Uses the `public_api` entitlement seam. During beta all hosted plans include
 * this feature, but the gate remains for post-beta policy changes.
 */
export function createApiTokensRouter(db: Database.Database, planService: PlanService): Router {
  const router = Router();
  const tokens = new ApiTokenService(db);

  const param = (v: unknown): string => (Array.isArray(v) ? v[0] : String(v ?? ''));

  // List tokens (masked — never returns the plaintext or hash).
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'public_api');
    sendData(res, tokens.list(userId));
  }));

  // Create a token — plaintext returned ONCE in this response.
  router.post('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'public_api');
    const input = parseBody(createTokenSchema, req);
    const created = tokens.create(userId, input.name, input.scopes ?? 'read,write');
    sendData(res, created, undefined, 201);
  }));

  // Revoke a token.
  router.delete('/:id', asyncHandler((req, res) => {
    const userId = getUserId(req);
    planService.requireFeature(userId, 'public_api');
    const ok = tokens.revoke(userId, param(req.params.id));
    if (!ok) throw new ApiError(404, 'not_found', 'Token not found');
    sendData(res, { id: param(req.params.id), revoked: true });
  }));

  return router;
}
