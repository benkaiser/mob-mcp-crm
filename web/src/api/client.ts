import { signal } from '@preact/signals';
import type { ApiEnvelope, ApiErrorBody, ApiResult, PageMeta } from './types';

const API_BASE = '/web/api';
const CSRF_COOKIE = 'mob_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

/**
 * Signal that flips to true when the API reports an authentication failure
 * (HTTP 401). The auth guard subscribes to this and redirects to the server
 * login page. Set once, read by the shell.
 */
export const authFailed = signal(false);

/** Typed error thrown on any non-success API response. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Read a cookie value by name from document.cookie (JS-readable cookies only). */
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Redirect the browser to the server-rendered login page, preserving the
 * current /app path so the user lands back where they started after auth.
 */
export function redirectToLogin(): void {
  const here = window.location.pathname + window.location.search;
  window.location.href = `/web/login?redirect=${encodeURIComponent(here)}`;
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, opts: RequestOptions): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  const isMutation = opts.method !== 'GET';

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Double-submit CSRF: echo the mob_csrf cookie in the X-CSRF-Token header
  // on every state-changing request. The server sets the cookie on GETs.
  if (isMutation) {
    const token = readCookie(CSRF_COOKIE);
    if (token) headers[CSRF_HEADER] = token;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method,
    headers,
    credentials: 'include',
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  // 401 → trigger the auth-failure signal so the shell can redirect to login.
  if (res.status === 401) {
    authFailed.value = true;
    throw new ApiError(401, 'unauthorized', 'Authentication required');
  }

  // 204 / empty body handling.
  let json: unknown = undefined;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'invalid_response', 'Malformed JSON response');
    }
  }

  if (!res.ok) {
    const err = (json as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'error',
      err?.message ?? `Request failed (${res.status})`,
      err?.details,
    );
  }

  const envelope = (json ?? { data: undefined }) as ApiEnvelope<T>;
  return { data: envelope.data, meta: envelope.meta as PageMeta | undefined };
}

export function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'POST', body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'PATCH', body });
}

export function apiDelete<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>(path, { method: 'DELETE', body });
}
