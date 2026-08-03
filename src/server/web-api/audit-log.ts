import { Router } from 'express';
import type Database from 'better-sqlite3';
import { AuditService } from '../../services/audit.js';
import { asyncHandler, sendData, getUserId, pageParams, pageMeta } from './helpers.js';

export function createAuditLogRouter(db: Database.Database): Router {
  const router = Router();
  const audit = new AuditService(db);

  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    const p = pageParams(req, 25, 100);
    const result = audit.list(userId, { page: p.page, per_page: p.perPage });
    sendData(res, result.data, pageMeta(result.total, p));
  }));

  return router;
}
