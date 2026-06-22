import { Router } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { SearchService, type SearchEntityType } from '../../services/search.js';
import { asyncHandler, sendData, parseQuery, getUserId } from './helpers.js';

const ENTITY_TYPES: SearchEntityType[] = [
  'contacts', 'notes', 'activities', 'life_events', 'gifts', 'tasks',
  'reminders', 'debts', 'relationships', 'contact_methods', 'addresses', 'custom_fields',
];

const entityTypeEnum = z.enum(ENTITY_TYPES as [SearchEntityType, ...SearchEntityType[]]);

// `q` must be a non-empty string; `types` is a comma-separated list; `limit`
// becomes limit_per_type.
const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'q is required'),
  types: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
}).passthrough();

/**
 * Internal API router for global search, mounted at /web/api/search.
 *
 * GET /?q=...&types=...&limit=... → SearchService.globalSearch, returning the
 * grouped-by-entity result shape. Missing/empty `q` yields a 422.
 */
export function createSearchRouter(db: Database.Database): Router {
  const router = Router();
  const search = new SearchService(db);

  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const q = parseQuery(searchQuerySchema, req);

    const options: { query: string; entity_types?: SearchEntityType[]; limit_per_type?: number } = {
      query: q.q,
    };

    if (q.types) {
      const requested = q.types.split(',').map((t) => t.trim()).filter(Boolean);
      const valid = requested
        .map((t) => entityTypeEnum.safeParse(t))
        .filter((r) => r.success)
        .map((r) => (r as { data: SearchEntityType }).data);
      if (valid.length > 0) options.entity_types = valid;
    }
    if (q.limit !== undefined) options.limit_per_type = q.limit;

    const result = search.globalSearch(userId, options);
    sendData(res, result);
  }));

  return router;
}
