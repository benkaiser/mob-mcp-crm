// Typed wrappers for the API-token and webhook management endpoints
// (/web/api/tokens, /web/api/webhooks). These mirror the server shapes by hand;
// the generic client handles CSRF + envelope unwrapping.

import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ApiResult, PageMeta } from './types';

// ─── API tokens ─────────────────────────────────────────────────

/** A masked API token as returned by list/create (never includes plaintext). */
export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Create response: like ApiToken plus the one-time plaintext `token`. */
export interface ApiTokenCreated {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  token: string;
}

export function listTokens(): Promise<ApiResult<ApiToken[]>> {
  return apiGet<ApiToken[]>('/tokens');
}

export function createToken(body: { name: string; scopes?: string }): Promise<ApiResult<ApiTokenCreated>> {
  return apiPost<ApiTokenCreated>('/tokens', body);
}

export function revokeToken(id: string): Promise<ApiResult<{ id: string; revoked: true }>> {
  return apiDelete<{ id: string; revoked: true }>(`/tokens/${encodeURIComponent(id)}`);
}

// ─── Webhooks ───────────────────────────────────────────────────

/** Booleans can arrive as 0|1 integers from the server. */
export type IntBool = 0 | 1 | boolean;

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[] | '*';
  active: IntBool;
  created_at: string;
  updated_at: string;
}

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

export interface WebhookDelivery {
  id: string;
  event: string;
  status: WebhookDeliveryStatus;
  response_status: number | null;
  attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

/** Coerce a 0|1|boolean server value into a real boolean. */
export function toBool(v: IntBool): boolean {
  return v === true || v === 1;
}

export function listWebhooks(): Promise<ApiResult<Webhook[]>> {
  return apiGet<Webhook[]>('/webhooks');
}

export function createWebhook(body: {
  url: string;
  events: string[] | '*';
  secret?: string;
}): Promise<ApiResult<Webhook>> {
  return apiPost<Webhook>('/webhooks', body);
}

export function updateWebhook(
  id: string,
  body: { url?: string; events?: string[] | '*'; secret?: string; active?: boolean },
): Promise<ApiResult<Webhook>> {
  return apiPatch<Webhook>(`/webhooks/${encodeURIComponent(id)}`, body);
}

export function deleteWebhook(id: string): Promise<ApiResult<{ id: string; deleted: true }>> {
  return apiDelete<{ id: string; deleted: true }>(`/webhooks/${encodeURIComponent(id)}`);
}

export function testWebhook(id: string): Promise<ApiResult<{ dispatched: true }>> {
  return apiPost<{ dispatched: true }>(`/webhooks/${encodeURIComponent(id)}/test`);
}

export function listDeliveries(
  id: string,
  page = 1,
  perPage = 10,
): Promise<{ data: WebhookDelivery[]; meta?: PageMeta }> {
  return apiGet<WebhookDelivery[]>(
    `/webhooks/${encodeURIComponent(id)}/deliveries?page=${page}&per_page=${perPage}`,
  );
}

/** Known webhook event types offered in the create UI (plus `*` = all). */
export const WEBHOOK_EVENTS = [
  'contact.created',
  'contact.updated',
  'contact.deleted',
  'activity.created',
  'reminder.due',
  'task.created',
  'task.completed',
] as const;
