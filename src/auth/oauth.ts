import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { AccountService } from './accounts.js';

// ─── Types ──────────────────────────────────────────────────────

export interface AuthorizationCode {
  code: string;
  userId: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  expiresAt: number;
}

export interface TokenRecord {
  accessToken: string;
  userId: string;
  clientId: string;
  createdAt: number;
  expiresAt: number;
}

// ─── PKCE Helpers ───────────────────────────────────────────────

/**
 * Verify PKCE code_verifier against stored code_challenge.
 * Supports S256 (SHA-256) and plain methods.
 */
export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method === 'S256') {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }
  return false;
}

// ─── OAuth Service ──────────────────────────────────────────────

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export class OAuthService {
  private authCodes: Map<string, AuthorizationCode> = new Map();

  constructor(
    private db: Database.Database,
    private accounts: AccountService,
  ) {}

  /**
   * Generate an authorization code after successful authentication.
   * The code is tied to PKCE parameters for later verification.
   */
  createAuthorizationCode(params: {
    userId: string;
    clientId: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    redirectUri: string;
  }): string {
    const code = randomBytes(32).toString('hex');

    this.authCodes.set(code, {
      code,
      userId: params.userId,
      clientId: params.clientId,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      redirectUri: params.redirectUri,
      expiresAt: Date.now() + CODE_EXPIRY_MS,
    });

    return code;
  }

  /**
   * Exchange an authorization code for an access token.
   * Verifies PKCE code_verifier and logs the authorization.
   */
  exchangeCode(params: {
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
    ipAddress?: string;
    userAgent?: string;
  }): { access_token: string; token_type: string; expires_in: number } | null {
    const authCode = this.authCodes.get(params.code);
    if (!authCode) return null;

    // Delete the code (one-time use)
    this.authCodes.delete(params.code);

    // Check expiry
    if (Date.now() > authCode.expiresAt) return null;

    // Verify client_id matches
    if (authCode.clientId !== params.clientId) return null;

    // Verify redirect_uri matches
    if (authCode.redirectUri !== params.redirectUri) return null;

    // Verify PKCE
    if (!verifyPkce(params.codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
      return null;
    }

    // Generate access token
    const accessToken = randomBytes(32).toString('hex');
    const createdAt = Date.now();
    const expiresAt = createdAt + TOKEN_EXPIRY_MS;

    this.db.prepare(`
      INSERT INTO oauth_tokens (access_token, user_id, client_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(accessToken, authCode.userId, authCode.clientId, createdAt, expiresAt);

    // Log authorization
    this.logAuthorization(authCode.userId, authCode.clientId, params.ipAddress, params.userAgent);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(TOKEN_EXPIRY_MS / 1000),
    };
  }

  /**
   * Get the full token record for an access token.
   * Used by McpTokenVerifier to access clientId and expiresAt.
   */
  getTokenRecord(accessToken: string): TokenRecord | null {
    const record = this.db.prepare(`
      SELECT access_token, user_id, client_id, created_at, expires_at
      FROM oauth_tokens WHERE access_token = ?
    `).get(accessToken) as { access_token: string; user_id: string; client_id: string; created_at: number; expires_at: number } | undefined;

    if (!record) return null;

    if (Date.now() > record.expires_at) {
      this.db.prepare('DELETE FROM oauth_tokens WHERE access_token = ?').run(accessToken);
      return null;
    }

    // Update last_used_at in authorization log
    this.db.prepare(`
      UPDATE authorization_log SET last_used_at = datetime('now')
      WHERE user_id = ? AND client_id = ?
    `).run(record.user_id, record.client_id);

    return {
      accessToken: record.access_token,
      userId: record.user_id,
      clientId: record.client_id,
      createdAt: record.created_at,
      expiresAt: record.expires_at,
    };
  }

  /**
   * Validate an access token and return the user ID.
   */
  validateToken(accessToken: string): string | null {
    const record = this.db.prepare(`
      SELECT access_token, user_id, client_id, expires_at
      FROM oauth_tokens WHERE access_token = ?
    `).get(accessToken) as { access_token: string; user_id: string; client_id: string; expires_at: number } | undefined;

    if (!record) return null;

    if (Date.now() > record.expires_at) {
      this.db.prepare('DELETE FROM oauth_tokens WHERE access_token = ?').run(accessToken);
      return null;
    }

    // Update last_used_at in authorization log
    this.db.prepare(`
      UPDATE authorization_log SET last_used_at = datetime('now')
      WHERE user_id = ? AND client_id = ?
    `).run(record.user_id, record.client_id);

    return record.user_id;
  }

  /**
   * Revoke an access token.
   */
  revokeToken(accessToken: string): boolean {
    const result = this.db.prepare('DELETE FROM oauth_tokens WHERE access_token = ?').run(accessToken);
    return result.changes > 0;
  }

  /**
   * Log an OAuth authorization event.
   */
  private logAuthorization(userId: string, clientId: string, ipAddress?: string, userAgent?: string): void {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO authorization_log (id, user_id, client_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, clientId, ipAddress ?? null, userAgent ?? null);
  }

  /**
   * Clean up expired codes and tokens (call periodically).
   */
  cleanup(): void {
    const now = Date.now();

    for (const [code, record] of this.authCodes) {
      if (now > record.expiresAt) this.authCodes.delete(code);
    }

    this.db.prepare('DELETE FROM oauth_tokens WHERE expires_at < ?').run(now);
  }
}
