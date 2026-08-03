import { Router } from 'express';
import type Database from 'better-sqlite3';
import { DataExportService } from '../../services/data-export.js';
import { asyncHandler, sendData, getUserId } from './helpers.js';

/**
 * Internal API router for data export, mounted at /web/api/export.
 *
 * GET /statistics → CRM statistics summary.
 * GET /           → full JSON dump of the user's data.
 *
 * `/statistics` is registered before `/` so the literal path matches first.
 */
export function createExportRouter(db: Database.Database): Router {
  const router = Router();
  const exporter = new DataExportService(db);

  // GET /statistics - aggregate counts.
  router.get('/statistics', asyncHandler((req, res) => {
    const userId = getUserId(req);
    sendData(res, exporter.getStatistics(userId));
  }));

  // GET / - full export dump.
  router.get('/', asyncHandler((req, res) => {
    const userId = getUserId(req);
    sendData(res, exporter.exportAll(userId));
  }));

  return router;
}
