import type Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────

export interface Session {
  token: string;
  userId: string;
  userName: string;
  email: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

// Default session lifetime: 30 days (sliding).
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Durable, restart-safe web session store backed by the `sessions` table.
 * Replaces the previous in-memory Map so logins survive process restarts and
 * can be shared across multiple server instances using the same database.
 */
export class SessionService {
  constructor(
    private db: Database.Database,
    private ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  /**
   * Create a new session for the given user. Returns the opaque session token.
   */
  create(userId: string, meta: SessionMeta = {}): string {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + this.ttlMs).toISOString();
    this.db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?)`
    ).run(token, userId, expiresAt, meta.userAgent ?? null, meta.ip ?? null);
    return token;
  }

  /**
   * Look up a session by token. Returns null if missing or expired.
   * On a successful lookup, refreshes last_seen_at and slides the expiry window.
   */
  get(token: string): Session | null {
    if (!token) return null;
    const row = this.db.prepare(
      `SELECT s.token, s.user_id, s.created_at, s.last_seen_at, s.expires_at,
              u.name AS user_name, u.email AS email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    ).get(token) as any;

    if (!row) return null;

    // Expired? Destroy and treat as missing.
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      this.destroy(token);
      return null;
    }

    // Sliding expiry: refresh last_seen_at and extend expires_at.
    const newExpiry = new Date(Date.now() + this.ttlMs).toISOString();
    this.db.prepare(
      `UPDATE sessions SET last_seen_at = datetime('now'), expires_at = ? WHERE token = ?`
    ).run(newExpiry, token);

    return {
      token: row.token,
      userId: row.user_id,
      userName: row.user_name,
      email: row.email,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: newExpiry,
    };
  }

  /**
   * Destroy a single session by token.
   */
  destroy(token: string): void {
    if (!token) return;
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  /**
   * Destroy all sessions for a user (e.g. on password change / "log out everywhere").
   */
  destroyAllForUser(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  /**
   * Destroy all sessions for a user except the one with `keepToken`
   * (e.g. after a password change: keep the current browser signed in, boot
   * every other session). Returns the number of sessions removed.
   */
  destroyAllForUserExcept(userId: string, keepToken: string): number {
    return this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
      .run(userId, keepToken).changes;
  }

  /**
   * List a user's active sessions with a stable, non-secret public id (a hash
   * of the token) so the raw session token is never exposed to the client.
   */
  listForUser(userId: string): Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string;
    userAgent: string | null;
    ip: string | null;
  }> {
    const rows = this.db.prepare(
      `SELECT token, created_at, last_seen_at, user_agent, ip
       FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC`
    ).all(userId) as Array<{
      token: string; created_at: string; last_seen_at: string; user_agent: string | null; ip: string | null;
    }>;
    return rows.map((r) => ({
      id: publicSessionId(r.token),
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      userAgent: r.user_agent,
      ip: r.ip,
    }));
  }

  /** Public (hashed) id for a raw session token - matches `listForUser` ids. */
  publicId(token: string): string {
    return publicSessionId(token);
  }

  /**
   * Revoke a single session identified by its public id, scoped to the user so
   * a user can only revoke their own sessions. Returns true if one was removed.
   */
  destroyForUserByPublicId(userId: string, publicId: string): boolean {
    const rows = this.db.prepare('SELECT token FROM sessions WHERE user_id = ?')
      .all(userId) as Array<{ token: string }>;
    const match = rows.find((r) => publicSessionId(r.token) === publicId);
    if (!match) return false;
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(match.token);
    return true;
  }

  /**
   * Delete all expired sessions. Returns the number removed.
   */
  cleanupExpired(): number {
    const result = this.db.prepare(
      `DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`
    ).run();
    return result.changes;
  }
}

/** Stable, non-reversible public identifier derived from a session token. */
function publicSessionId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}
