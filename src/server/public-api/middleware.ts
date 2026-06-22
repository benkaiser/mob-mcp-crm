import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ApiTokenService } from '../../services/api-tokens.js';
import type { PlanService } from '../../services/plans.js';
import { sendError } from './helpers.js';

// ─── Auth context ───────────────────────────────────────────────

export interface ApiUser {
  userId: string;
  scopes: string[];
}

interface AuthedRequest extends Request {
  apiUser?: ApiUser;
}

/** Read the authed userId attached by `bearerAuth`. Throws if missing. */
export function getApiUserId(req: Request): string {
  const apiUser = (req as AuthedRequest).apiUser;
  if (!apiUser?.userId) {
    // Should never happen if bearerAuth ran first; treated as 401 by handler.
    const err = Object.assign(new Error('Authentication required'), {
      status: 401,
      code: 'unauthorized',
    });
    throw err;
  }
  return apiUser.userId;
}

/** Read the authed token's scopes. */
export function getScopes(req: Request): string[] {
  return (req as AuthedRequest).apiUser?.scopes ?? [];
}

// ─── Bearer authentication ──────────────────────────────────────

/**
 * Parse `Authorization: Bearer <token>`, verify it via the token service, and
 * attach `req.apiUser = { userId, scopes }`. Responds 401 on any failure.
 */
export function bearerAuth(tokenService: ApiTokenService): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const match = value?.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      sendError(res, 401, 'unauthorized', 'Missing or malformed Authorization header');
      return;
    }
    const verified = tokenService.verify(match[1].trim());
    if (!verified) {
      sendError(res, 401, 'unauthorized', 'Invalid or revoked API token');
      return;
    }
    (req as AuthedRequest).apiUser = verified;
    next();
  };
}

// ─── Plan gating ────────────────────────────────────────────────

/**
 * Require the `public_api` feature for the authed user. No-op when self-hosted
 * (PlanService treats everyone as unlimited). In hosted-free mode this forwards
 * the thrown FeatureNotAvailableError (403) to the error handler.
 */
export function requirePublicApi(planService: PlanService): RequestHandler {
  return (req, _res, next) => {
    try {
      planService.requireFeature(getApiUserId(req), 'public_api');
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── Scope enforcement ──────────────────────────────────────────

/** Require a scope (e.g. 'read' or 'write') on the authed token. */
export function requireScope(scope: 'read' | 'write'): RequestHandler {
  return (req, res, next) => {
    if (getScopes(req).includes(scope)) {
      next();
      return;
    }
    sendError(res, 403, 'forbidden', `This token lacks the required "${scope}" scope`);
  };
}

/**
 * Generic scope guard: 'read' for safe methods (GET/HEAD/OPTIONS), 'write' for
 * state-changing methods (POST/PATCH/PUT/DELETE).
 */
export function scopeGuard(): RequestHandler {
  return (req, res, next) => {
    const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    const needed: 'read' | 'write' = safe ? 'read' : 'write';
    if (getScopes(req).includes(needed)) {
      next();
      return;
    }
    sendError(res, 403, 'forbidden', `This token lacks the required "${needed}" scope`);
  };
}

// ─── Rate limiting ──────────────────────────────────────────────

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Injectable clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

interface Bucket { count: number; resetAt: number }

/**
 * Fixed-window in-memory rate limiter keyed by the authed userId. On exceed,
 * responds 429 with a `Retry-After` header (seconds). Must run AFTER bearerAuth.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const { windowMs, max } = options;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    const key = (req as AuthedRequest).apiUser?.userId ?? 'anonymous';
    const t = now();
    let bucket = buckets.get(key);
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - t) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      sendError(res, 429, 'rate_limited', 'Rate limit exceeded. Slow down.');
      return;
    }
    next();
  };
}

export type { NextFunction, Request, Response };
