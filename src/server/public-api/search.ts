import { Router } from 'express';
import type Database from 'better-sqlite3';
import { SearchService, type SearchEntityType } from '../../services/search.js';
import {
  asyncHandler,
  sendData,
  ApiError,
} from './helpers.js';
import { getApiUserId } from './middleware.js';

/**
 * Public REST API router for global search (mounted at /api/v1/search).
 * GET /?query=...&entity_types=contacts,notes&limit_per_type=10
 */
export function createSearchRouter(db: Database.Database): Router {
  const router = Router();
  const search = new SearchService(db);

  router.get('/', asyncHandler((req, res) => {
    const userId = getApiUserId(req);
    const q = req.query;
    if (typeof q.query !== 'string' || q.query.length === 0) {
      throw new ApiError(422, 'validation_error', 'query parameter is required');
    }
    let entityTypes: SearchEntityType[] | undefined;
    if (typeof q.entity_types === 'string' && q.entity_types.length > 0) {
      entityTypes = q.entity_types.split(',').map((s) => s.trim()).filter(Boolean) as SearchEntityType[];
    }
    const limitPerType = typeof q.limit_per_type === 'string' ? parseInt(q.limit_per_type, 10) || undefined : undefined;
    const result = search.globalSearch(userId, { query: q.query, entity_types: entityTypes, limit_per_type: limitPerType });
    sendData(res, result.results, { total_matches: result.total_matches });
  }));

  return router;
}
