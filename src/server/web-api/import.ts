import { Router, json } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { PlanService } from '../../services/plans.js';
import { parseVCard } from '../../services/import-vcard.js';
import { parseGoogleCsv } from '../../services/import-google-csv.js';
import { runImportPipeline, type NormalizedContact } from '../../services/import-pipeline.js';
import { importMonicaExport } from '../../services/monica-import.js';
import { asyncHandler, sendData, parseBody, getUserId, ApiError } from './helpers.js';

const uploadSchema = z.object({ text: z.string().min(1, 'text is required') }).strict();

type Parser = (text: string) => NormalizedContact[];

/**
 * Internal API router for contact imports, mounted at /web/api/import.
 *
 * The SPA POSTs raw file text as JSON (`{ text }`) rather than multipart, so
 * this router stays multer-free.
 *
 * POST /vcard, POST /google-csv          → parse + runImportPipeline → ImportSummary.
 * POST /preview/vcard, /preview/google-csv → parse only; no writes. The pipeline
 *   has no dry-run flag, so the preview returns the parsed records plus a count.
 *
 * `planService` is forwarded to the pipeline so quota is enforced in hosted mode.
 */
export function createImportRouter(db: Database.Database, planService: PlanService): Router {
  const router = Router();

  const doImport = (parser: Parser) => asyncHandler((req, res) => {
    const userId = getUserId(req);
    const { text } = parseBody(uploadSchema, req);
    const records = parser(text);
    const summary = runImportPipeline(db, userId, records, { planService });
    sendData(res, summary);
  });

  const doPreview = (parser: Parser) => asyncHandler((req, res) => {
    getUserId(req); // enforce auth
    const { text } = parseBody(uploadSchema, req);
    const records = parser(text);
    sendData(res, { records, count: records.length });
  });

  router.post('/vcard', doImport(parseVCard));
  router.post('/google-csv', doImport(parseGoogleCsv));
  router.post('/preview/vcard', doPreview(parseVCard));
  router.post('/preview/google-csv', doPreview(parseGoogleCsv));

  // Monica CRM import is a DESTRUCTIVE, whole-account replace (the importer
  // deletes the user's existing data first), and returns its own per-entity
  // ImportResult rather than the additive pipeline's ImportSummary. SQL exports
  // are commonly multi-MB, so raise the JSON body limit just for this route
  // (the router-wide json() default is 100kb).
  const monicaSchema = z.object({ text: z.string().min(100, 'A valid Monica SQL export is required') }).strict();
  router.post('/monica', json({ limit: '25mb' }), asyncHandler((req, res) => {
    const userId = getUserId(req);
    const { text } = parseBody(monicaSchema, req);
    if (!text.includes('INSERT')) {
      throw new ApiError(422, 'invalid_file', 'The file does not appear to be a valid Monica SQL export.');
    }
    const result = importMonicaExport(db, userId, text);
    sendData(res, result);
  }));

  return router;
}
