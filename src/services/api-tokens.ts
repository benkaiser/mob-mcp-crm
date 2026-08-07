import type Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

/** A token row as exposed to API consumers (never includes hash/plaintext). */
export interface ApiTokenSummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** The full result of creating a token. The `token` plaintext is only ever
 *  returned here - it cannot be recovered later. */
export interface CreatedApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  token: string;
}

/** Result of a successful token verification. */
export interface VerifiedToken {
  userId: string;
  scopes: string[];
}

// ─── Service ────────────────────────────────────────────────────

const TOKEN_SCHEME = 'mob_';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Issues and verifies API tokens for the public REST API.
 *
 * Tokens look like `mob_<43 base64url chars>`. Only the sha256 hash is stored.
 * A short prefix (first 8 chars of the random part) is stored to help users
 * identify a token in listings without exposing the secret.
 */
export class ApiTokenService {
  constructor(private db: Database.Database) {}

  /** Create a new token for a user. Returns the PLAINTEXT token (once only). */
  create(userId: string, name: string, scopes = 'read,write'): CreatedApiToken {
    const secret = randomBytes(32).toString('base64url');
    const token = `${TOKEN_SCHEME}${secret}`;
    const prefix = secret.slice(0, 8);
    const id = generateId();
    const tokenHash = sha256(token);

    this.db.prepare(`
      INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, scopes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, name, tokenHash, prefix, scopes);

    return { id, name, prefix, scopes, token };
  }

  /** List a user's tokens (masked - no hash or plaintext). */
  list(userId: string): ApiTokenSummary[] {
    return this.db.prepare(`
      SELECT id, name, prefix, scopes, created_at, last_used_at, revoked_at
      FROM api_tokens
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as ApiTokenSummary[];
  }

  /** Revoke a token. Returns true if a token was revoked. */
  revoke(userId: string, id: string): boolean {
    const result = this.db.prepare(`
      UPDATE api_tokens
      SET revoked_at = datetime('now')
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `).run(id, userId);
    return result.changes > 0;
  }

  /**
   * Revoke every active API token for a user (they never expire on their own).
   * Used after a security-sensitive event (password change/reset) so a stolen
   * long-lived API token can't keep working. Returns the count revoked.
   */
  revokeAllForUser(userId: string): number {
    const result = this.db.prepare(`
      UPDATE api_tokens
      SET revoked_at = datetime('now')
      WHERE user_id = ? AND revoked_at IS NULL
    `).run(userId);
    return result.changes;
  }

  /**
   * Verify a plaintext token. On success, bumps last_used_at and returns the
   * owning userId + parsed scopes. Returns null for unknown/revoked tokens.
   */
  verify(plaintextToken: string): VerifiedToken | null {
    if (!plaintextToken) return null;
    const tokenHash = sha256(plaintextToken);
    const row = this.db.prepare(`
      SELECT id, user_id, scopes, revoked_at
      FROM api_tokens
      WHERE token_hash = ?
    `).get(tokenHash) as
      | { id: string; user_id: string; scopes: string; revoked_at: string | null }
      | undefined;

    if (!row || row.revoked_at) return null;

    this.db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(row.id);

    const scopes = row.scopes.split(',').map((s) => s.trim()).filter(Boolean);
    return { userId: row.user_id, scopes };
  }
}
