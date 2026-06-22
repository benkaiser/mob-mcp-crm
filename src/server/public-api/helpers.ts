import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

// ─── Response envelopes ─────────────────────────────────────────

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Send a success envelope: `{ data, meta? }`. */
export function sendData(res: Response, data: unknown, meta?: unknown, status = 200): void {
  res.status(status).json(meta === undefined ? { data } : { data, meta });
}

/** Send an error envelope: `{ error: { code, message, details? } }`. */
export function sendError(res: Response, status: number, code: string, message: string, details?: unknown): void {
  const body: ErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  res.status(status).json(body);
}

/** Error type that carries an HTTP status + machine code for the error handler. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Async handler wrapper ──────────────────────────────────────

/** Wrap an async route so thrown errors flow to the central error handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Validation ─────────────────────────────────────────────────

/** Parse `req.body` with a zod schema, throwing a 422 ApiError on failure. */
export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  return runParse(schema, req.body);
}

/** Parse `req.query` with a zod schema, throwing a 422 ApiError on failure. */
export function parseQuery<T>(schema: ZodType<T>, req: Request): T {
  return runParse(schema, req.query);
}

function runParse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw new ApiError(422, 'validation_error', 'Request validation failed', details);
    }
    throw err;
  }
}

// ─── Pagination ─────────────────────────────────────────────────

export interface PageParams {
  page: number;
  perPage: number;
  limit: number;
  offset: number;
}

export interface PageMeta {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** Parse `page`/`per_page` query params with sane defaults & bounds. */
export function pageParams(req: Request, defaultPerPage = 25, maxPerPage = 100): PageParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  let perPage = parseInt(String(req.query.per_page ?? String(defaultPerPage)), 10) || defaultPerPage;
  perPage = Math.min(Math.max(1, perPage), maxPerPage);
  return { page, perPage, limit: perPage, offset: (page - 1) * perPage };
}

/** Build pagination metadata for the response envelope. */
export function pageMeta(total: number, p: PageParams): PageMeta {
  return {
    total,
    page: p.page,
    per_page: p.perPage,
    total_pages: Math.max(1, Math.ceil(total / p.perPage)),
  };
}

// ─── Param helper ───────────────────────────────────────────────

/** Read a single Express 5 route param (which may be string | string[]). */
export function param(v: unknown): string {
  return Array.isArray(v) ? v[0] : String(v ?? '');
}

// ─── Central error handler ──────────────────────────────────────

/** Express error-handling middleware that renders the error envelope. */
export function apiErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  // Errors carrying explicit HTTP status/code (ApiError, QuotaExceededError,
  // FeatureNotAvailableError, etc.)
  const anyErr = err as { status?: number; code?: string; message?: string; details?: unknown };
  if (anyErr && typeof anyErr.status === 'number' && typeof anyErr.code === 'string') {
    sendError(res, anyErr.status, anyErr.code, anyErr.message ?? 'Error', anyErr.details);
    return;
  }

  console.error('Internal public API error:', err);
  sendError(res, 500, 'internal_error', 'An unexpected error occurred');
}
