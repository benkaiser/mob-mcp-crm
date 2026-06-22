import { Router, json } from 'express';
import type Database from 'better-sqlite3';
import type { PlanService } from '../../services/plans.js';
import type { ApiTokenService } from '../../services/api-tokens.js';
import { asyncHandler, sendData, apiErrorHandler } from './helpers.js';
import {
  bearerAuth,
  requirePublicApi,
  rateLimit,
  scopeGuard,
  getApiUserId,
  getScopes,
} from './middleware.js';
import { createContactsRouter } from './contacts.js';
import { createActivitiesRouter } from './activities.js';
import { createLifeEventsRouter } from './life-events.js';
import { createNotesRouter } from './notes.js';
import { createRemindersRouter } from './reminders.js';
import { createTimelineRouter } from './timeline.js';
import { createGiftsRouter } from './gifts.js';
import { createDebtsRouter } from './debts.js';
import { createTasksRouter } from './tasks.js';
import { createTagsRouter } from './tags.js';
import { createSearchRouter } from './search.js';
import { createExportRouter } from './export.js';

export interface PublicApiDeps {
  db: Database.Database;
  planService: PlanService;
  tokenService: ApiTokenService;
  /** Rate-limit window in ms (default 60_000). */
  rateLimitWindowMs?: number;
  /** Max requests per window per token-owner (default 1000). */
  rateLimitMax?: number;
  /** Injectable clock for deterministic rate-limit tests. */
  now?: () => number;
}

/**
 * Build the public REST API router mounted at `/api/v1`.
 *
 * Auth: `Authorization: Bearer <mob_...>` tokens (NOT session cookies).
 * Pipeline: bearer auth → public_api feature gate (plan) → rate limit →
 * scope guard (read for GET, write for mutations) → entity routers → error handler.
 *
 * Plan gating is a no-op when self-hosted (PlanService treats everyone as
 * unlimited). In hosted-free mode the feature gate returns 403.
 */
export function createPublicApiRouter(deps: PublicApiDeps): Router {
  const { db, planService, tokenService } = deps;
  const router = Router();

  router.use(json());
  router.use(bearerAuth(tokenService));
  router.use(requirePublicApi(planService));
  router.use(rateLimit({
    windowMs: deps.rateLimitWindowMs ?? 60_000,
    max: deps.rateLimitMax ?? 1000,
    now: deps.now,
  }));
  router.use(scopeGuard());

  // Identity / introspection endpoint.
  router.get('/me', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const usage = planService.getUsage(userId);
    const entitlements = planService.getEntitlements(userId);
    sendData(res, {
      id: userId,
      scopes: getScopes(req),
      plan: usage.plan,
      hosted: planService.isHosted(),
      usage: { contacts: usage.contacts, contact_cap: usage.contactCap },
      entitlements: {
        contact_cap: entitlements.contactCap,
        public_api: entitlements.publicApi,
        webhooks: entitlements.webhooks,
        advanced_import: entitlements.advancedImport,
      },
    });
  }));

  router.use('/contacts', createContactsRouter(db, planService));
  router.use('/activities', createActivitiesRouter(db));
  router.use('/life-events', createLifeEventsRouter(db));
  router.use('/notes', createNotesRouter(db));
  router.use('/reminders', createRemindersRouter(db));
  router.use('/timeline', createTimelineRouter(db));
  router.use('/gifts', createGiftsRouter(db));
  router.use('/debts', createDebtsRouter(db));
  router.use('/tasks', createTasksRouter(db));
  router.use('/tags', createTagsRouter(db));
  router.use('/search', createSearchRouter(db));
  router.use('/export', createExportRouter(db));

  // Central error handler (must be last).
  router.use(apiErrorHandler);

  return router;
}
