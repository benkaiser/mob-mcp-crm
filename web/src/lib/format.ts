import { ApiError } from '../api/client';
import type { Contact } from '../api/types';

/** Map a 422 validation_error's details into a field → message record. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.code === 'validation_error' && Array.isArray(err.details)) {
    const out: Record<string, string> = {};
    for (const d of err.details as Array<{ path?: string; message?: string }>) {
      if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
    }
    return out;
  }
  return {};
}

/** Human-readable message from any thrown error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Display name for a contact-like record. */
export function contactName(c: Pick<Contact, 'first_name' | 'last_name' | 'nickname'>): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.nickname || 'Unnamed';
}

/** Format an ISO date(-time) string as a short local date, or '' if empty. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
