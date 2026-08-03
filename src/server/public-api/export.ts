import { Router } from 'express';
import type Database from 'better-sqlite3';
import { DataExportService } from '../../services/data-export.js';
import {
  asyncHandler,
  sendData,
} from './helpers.js';
import { getApiUserId } from './middleware.js';

/**
 * Public REST API router for full data export (mounted at /api/v1/export).
 * GET /        - full JSON export of the user's CRM data.
 * GET /stats   - aggregate statistics.
 */
export function createExportRouter(db: Database.Database): Router {
  const router = Router();
  const exporter = new DataExportService(db);

  router.get('/', asyncHandler((req, res) => {
    sendData(res, exporter.exportAll(getApiUserId(req)));
  }));

  router.get('/stats', asyncHandler((req, res) => {
    sendData(res, exporter.getStatistics(getApiUserId(req)));
  }));

  return router;
}
