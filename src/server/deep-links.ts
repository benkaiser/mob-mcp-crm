import type Database from 'better-sqlite3';
import { AccountService } from '../auth/accounts.js';

/**
 * AI↔Web continuity: build authenticated "view on web" deep-links.
 *
 * When the MCP server (AI head) performs an action, the tool result can
 * include a link that drops the user into the web UI already logged in via
 * the `/web/auto-login` landing endpoint.
 */

// ─── Entity → SPA route map ────────────────────────��────────────────
// Central, shared constant. SPA routes live under `/app/...` (a
// forward-looking convention being built in parallel).
export const ENTITY_ROUTES = {
  contact: (id: string) => `/app/contacts/${id}`,
  activity: (id: string) => `/app/activities/${id}`,
  reminder: (id: string) => `/app/reminders/${id}`,
  gift: (id: string) => `/app/gifts/${id}`,
  debt: (id: string) => `/app/debts/${id}`,
  task: (id: string) => `/app/tasks/${id}`,
  'life-event': (id: string) => `/app/life-events/${id}`,
  note: (id: string) => `/app/notes/${id}`,
} as const;

export type DeepLinkEntity = keyof typeof ENTITY_ROUTES;

export interface DeepLinkOptions {
  /** Forgetful mode: no persistent account, so auto-login tokens can't round-trip. */
  forgetful?: boolean;
}

/** Read the configured base_url from server_config (empty string if unset). */
function getBaseUrl(db: Database.Database): string {
  try {
    const row = db.prepare(
      "SELECT value FROM server_config WHERE key = 'base_url'"
    ).get() as { value: string } | undefined;
    return row?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * Build an authenticated deep-link into the web UI for a given entity.
 *
 * Returns `null` in forgetful mode (there is no persistent account, so the
 * minted auto-login token would never round-trip through a real session).
 *
 * Otherwise mints a short-lived one-time auto-login token via the
 * AccountService and points at the `/web/auto-login` landing endpoint, which
 * consumes the token, establishes the web session, and redirects to the route.
 *
 * Dependencies are injected (`db`, `accountService`) to keep it testable.
 */
export function deepLink(
  db: Database.Database,
  accountService: AccountService,
  userId: string,
  entity: DeepLinkEntity,
  id: string,
  opts: DeepLinkOptions = {}
): string | null {
  if (opts.forgetful) return null;

  const route = ENTITY_ROUTES[entity](id);
  const baseUrl = getBaseUrl(db);
  const token = accountService.createAutoLoginToken(userId);

  return `${baseUrl}/web/auto-login?token=${token}&redirect=${encodeURIComponent(route)}`;
}

/**
 * Convenience wrapper that constructs the AccountService internally.
 * Equivalent to `deepLink(db, new AccountService(db), ...)`.
 */
export function buildDeepLink(
  db: Database.Database,
  userId: string,
  entity: DeepLinkEntity,
  id: string,
  opts: DeepLinkOptions = {}
): string | null {
  return deepLink(db, new AccountService(db), userId, entity, id, opts);
}
