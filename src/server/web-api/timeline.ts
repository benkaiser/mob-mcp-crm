import { Router } from 'express';
import type Database from 'better-sqlite3';
import { TimelineService, type TimelineOptions } from '../../services/timeline.js';
import { ContactService } from '../../services/contacts.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  pageParams,
  pageMeta,
  getUserId,
} from './helpers.js';

/**
 * Internal API router for the unified contact timeline, mounted at /web/api/timeline.
 * Requires ?contact_id=...; optional &entry_type=activity|life_event|note|contact_created.
 * Ownership is verified via ContactService before delegating to TimelineService
 * (which does not scope by user on its own).
 */
export function createTimelineRouter(db: Database.Database): Router {
  const router = Router();
  const timeline = new TimelineService(db);
  const contacts = new ContactService(db);

  // GET /?contact_id=...&entry_type=...
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const q = req.query;
    if (typeof q.contact_id !== 'string' || q.contact_id.length === 0) {
      throw new ApiError(422, 'validation_error', 'contact_id query parameter is required');
    }
    const contact = contacts.get(userId, q.contact_id);
    if (!contact) throw new ApiError(404, 'not_found', 'Contact not found');

    const p = pageParams(req);
    const options: TimelineOptions = { page: p.page, per_page: p.perPage };
    if (typeof q.entry_type === 'string') options.entry_type = q.entry_type;

    const result = timeline.getTimeline(q.contact_id, options);
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  return router;
}
