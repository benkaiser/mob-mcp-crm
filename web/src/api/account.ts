// Typed wrappers for the account self-service endpoints (/web/api/account):
// password change, profile editing, email verification, connected AI
// assistants, active sessions and account deletion.

import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { ApiResult } from './types';

// ─── Password & profile ─────────────────────────────────────────

export function changePassword(body: { current_password: string; new_password: string }): Promise<ApiResult<{ ok: true }>> {
  return apiPost<{ ok: true }>('/account/password', body);
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
  timezone?: string;
  current_password?: string;
}

export interface ProfileUpdateResult {
  ok: true;
  email_change_pending: boolean;
  pending_email: string | null;
}

export function updateProfile(body: ProfileUpdate): Promise<ApiResult<ProfileUpdateResult>> {
  return apiPatch<ProfileUpdateResult>('/account/profile', body);
}

export function resendVerification(): Promise<ApiResult<{ ok: true; email: string }>> {
  return apiPost<{ ok: true; email: string }>('/account/resend-verification');
}

// ─── Connected AI assistants ────────────────────────────────────

export interface Connection {
  client_id: string;
  token_count: number;
  authorized_at: string | null;
  last_used_at: string | null;
  expires_at: string;
}

export function listConnections(): Promise<ApiResult<Connection[]>> {
  return apiGet<Connection[]>('/account/connections');
}

export function revokeConnection(clientId: string): Promise<ApiResult<{ client_id: string; revoked: true }>> {
  return apiDelete<{ client_id: string; revoked: true }>(`/account/connections/${encodeURIComponent(clientId)}`);
}

// ─── Active web sessions ────────────────────────────────────────

export interface WebSession {
  id: string;
  current: boolean;
  created_at: string;
  last_seen_at: string;
  user_agent: string | null;
  ip: string | null;
}

export function listSessions(): Promise<ApiResult<WebSession[]>> {
  return apiGet<WebSession[]>('/account/sessions');
}

export function revokeSession(id: string): Promise<ApiResult<{ id: string; revoked: true }>> {
  return apiDelete<{ id: string; revoked: true }>(`/account/sessions/${encodeURIComponent(id)}`);
}

export function revokeAllSessions(): Promise<ApiResult<{ revoked: number }>> {
  return apiPost<{ revoked: number }>('/account/sessions/revoke-all');
}

// ─── Account deletion ───────────────────────────────────────────

export function deleteAccount(body: { password: string; confirm_email: string }): Promise<ApiResult<{ deleted: true }>> {
  return apiDelete<{ deleted: true }>('/account', body);
}
