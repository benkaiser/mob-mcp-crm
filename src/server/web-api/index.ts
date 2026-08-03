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
import { createRelationshipTypesRouter } from './relationship-types.js';
import { createContactMethodTypesRouter } from './contact-method-types.js';
import { createContactTagsRouter } from './contact-tags.js';
import { createDashboardRouter } from './dashboard.js';
import { createAuditLogRouter } from './audit-log.js';
import { createSearchRouter } from './search.js';
import { createExportRouter } from './export.js';
import { createImportRouter } from './import.js';
import { createApiTokensRouter } from './api-tokens.js';
import { createWebhooksRouter } from './webhooks.js';
import { createAccountRouter } from './account.js';
import type { AccountService } from '../../auth/accounts.js';
import type { OAuthService } from '../../auth/oauth.js';
import type { SessionService } from '../../services/sessions.js';
import type { UserSettingsService } from '../../services/settings.js';
import type { EmailService } from '../../services/email.js';

export interface WebApiDeps {
  db: Database.Database;
  planService: PlanService;
  /** Resolve a web session from the raw cookie header, or null. */
  getWebSession: (token: string | null | undefined) => { userId: string; userName: string; email: string } | null;
  /** Parse a named cookie from the Cookie header. */
  parseCookie: (cookieHeader: string, name: string) => string | null;
  /** Whether cookies should be marked Secure (https). */
  cookieSecure: boolean;
  /** Services for the account self-service router. */
  accountService: AccountService;
  sessionService: SessionService;
  oauthService: OAuthService;
  settingsService: UserSettingsService;
  emailService: EmailService;
  baseUrl: string;
  forgetful: boolean;
}

/**
 * Build the internal JSON API router mounted at `/web/api`.
 *
 * Auth: session cookie (NOT bearer tokens). Returns 401 JSON (never redirects)
 * so the SPA can handle auth failures. Ungated for the free tier — this surface
 * powers the web UI, which all plans get in full.
 */
export function createWebApiRouter(deps: WebApiDeps): Router {
  const {
    db, planService, getWebSession, parseCookie, cookieSecure,
    accountService, sessionService, oauthService, settingsService, emailService, baseUrl, forgetful,
  } = deps;
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
    // Forgetful-mode users live in an ephemeral cloned DB, not the main users
    // table, so account/settings lookups don't apply — use sensible defaults.
    const verification = forgetful ? { email_verified: true, pending_email: null } : accountService.getVerification(userId);
    const timezone = forgetful ? 'UTC' : settingsService.get(userId).timezone;
    sendData(res, {
      id: session.userId,
      name: session.userName,
      email: session.email,
      email_verified: verification.email_verified,
      pending_email: verification.pending_email,
      timezone,
      plan: usage.plan,
      hosted: planService.isHosted(),
      beta: process.env.ENV === 'production',
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
  router.use('/relationship-types', createRelationshipTypesRouter(db, forgetful));
  router.use('/contact-method-types', createContactMethodTypesRouter(db, forgetful));
  router.use('/dashboard', createDashboardRouter(db));
  router.use('/audit-log', createAuditLogRouter(db));
  router.use('/search', createSearchRouter(db));
  router.use('/export', createExportRouter(db));
  router.use('/import', createImportRouter(db, planService));
  router.use('/tokens', createApiTokensRouter(db, planService));
  router.use('/webhooks', createWebhooksRouter(db, planService));
  router.use('/account', createAccountRouter({
    accountService, sessionService, oauthService, settingsService, emailService,
    baseUrl, cookieSecure, forgetful,
  }));

  // Central error handler (must be last).
  router.use(apiErrorHandler);

  return router;
}
