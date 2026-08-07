import { randomBytes } from 'node:crypto';

/**
 * Generate an 8-character base-36 ID (digits + lowercase letters).
 *
 * 36^8 ≈ 2.8 trillion combinations - effectively zero collision risk
 * for the <10K entities a single user will ever have, while consuming
 * ~75 % fewer tokens than the previous 32-char hex IDs.
 */
export function generateId(): string {
  const num = randomBytes(6).readUIntBE(0, 6);
  return num.toString(36).padStart(8, '0').slice(0, 8);
}

/**
 * Build a contact's display name from its name parts, including the
 * middle name when present (e.g. "John Jeffery Smith").
 */
export function formatContactName(c: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
}): string {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ');
}
