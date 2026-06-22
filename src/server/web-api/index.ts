import { Router, json, type RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import type { PlanService } from '../../services/plans.js';
import {
  asyncHandler,
  sendData,
  sendError,
  csrfMiddleware,
  apiErrorHandler,
  getUserId,
} from './helpers.js';
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
import { createContactMethodsRouter } from './contact-methods.js';
import { createContactAddressesRouter } from './contact-addresses.js';
import { createContactCustomFieldsRouter } from './contact-custom-fields.js';
import { createContactFoodPreferencesRouter } from './contact-food-preferences.js';
import { createContactRelationshipsRouter } from './contact-relationships.js';
import { createContactTagsRouter } from './contact-tags.js';
import { createDashboardRouter } from './dashboard.js';
import { createSearchRouter } from './search.js';
import { createExportRouter } from './export.js';
import { createImportRouter } from './import.js';
import { createApiTokensRouter } from './api-tokens.js';
import { createWebhooksRouter } from './webhooks.js';

export interface WebApiDeps {
  db: Database.Database;
  planService: PlanService;
  /** Resolve a web session from the raw cookie header, or null. */
  getWebSession: (token: string | null | undefined) => { userId: string; userName: string; email: string } | null;
  /** Parse a named cookie from the Cookie header. */
  parseCookie: (cookieHeader: string, name: string) => string | null;
  /** Whether cookies should be marked Secure (https). */
  cookieSecure: boolean;
}

/**
 * Build the internal JSON API router mounted at `/web/api`.
 *
 * Auth: session cookie (NOT bearer tokens). Returns 401 JSON (never redirects)
 * so the SPA can handle auth failures. Ungated for the free tier — this surface
 * powers the web UI, which all plans get in full.
 */
export function createWebApiRouter(deps: WebApiDeps): Router {
  const { db, planService, getWebSession, parseCookie, cookieSecure } = deps;
  const router = Router();

  // JSON body parsing scoped to the API. The Monica import route parses its own
  // (much larger) body, so skip it here — otherwise the 100kb default would 413
  // a multi-MB SQL export before that route's parser runs.
  const globalJson = json();
  router.use((req, res, next) => {
    if (req.path === '/import/monica') { next(); return; }
    globalJson(req, res, next);
  });

  // Session auth → 401 JSON instead of redirect.
  const requireApiSession: RequestHandler = (req, res, next) => {
    const token = parseCookie(req.headers.cookie ?? '', 'mob_session');
    const session = getWebSession(token);
    if (!session) {
      sendError(res, 401, 'unauthorized', 'Authentication required');
      return;
    }
    (req as { webUser?: unknown }).webUser = session;
    next();
  };

  router.use(requireApiSession);
  router.use(csrfMiddleware(cookieSecure));

  // ─── /web/api/me ──────────────────────────────────────────────
  router.get('/me', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const session = (req as unknown as { webUser: { userId: string; userName: string; email: string } }).webUser;
    const usage = planService.getUsage(userId);
    const entitlements = planService.getEntitlements(userId);
    sendData(res, {
      id: session.userId,
      name: session.userName,
      email: session.email,
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

  // Future entity routers mount here, e.g.:
  //   router.use('/contacts', createContactsRouter(db, planService));
  router.use('/contacts', createContactsRouter(db, planService));
  // Contact sub-entities (mounted on the same base; distinct sub-paths).
  router.use('/contacts', createContactMethodsRouter(db));
  router.use('/contacts', createContactAddressesRouter(db));
  router.use('/contacts', createContactCustomFieldsRouter(db));
  router.use('/contacts', createContactFoodPreferencesRouter(db));
  router.use('/contacts', createContactRelationshipsRouter(db));
  router.use('/contacts', createContactTagsRouter(db));
  router.use('/activities', createActivitiesRouter(db));
  router.use('/life-events', createLifeEventsRouter(db));
  router.use('/notes', createNotesRouter(db));
  router.use('/reminders', createRemindersRouter(db));
  router.use('/timeline', createTimelineRouter(db));
  router.use('/gifts', createGiftsRouter(db));
  router.use('/debts', createDebtsRouter(db));
  router.use('/tasks', createTasksRouter(db));
  router.use('/tags', createTagsRouter(db));
  router.use('/dashboard', createDashboardRouter(db));
  router.use('/search', createSearchRouter(db));
  router.use('/export', createExportRouter(db));
  router.use('/import', createImportRouter(db, planService));
  router.use('/tokens', createApiTokensRouter(db, planService));
  router.use('/webhooks', createWebhooksRouter(db, planService));

  // Central error handler (must be last).
  router.use(apiErrorHandler);

  return router;
}
