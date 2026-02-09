import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
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
  private tokens: Map<string, TokenRecord> = new Map();

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
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;

    this.tokens.set(accessToken, {
      accessToken,
      userId: authCode.userId,
      clientId: authCode.clientId,
      createdAt: Date.now(),
      expiresAt,
    });

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
    const record = this.tokens.get(accessToken);
    if (!record) return null;

    if (Date.now() > record.expiresAt) {
      this.tokens.delete(accessToken);
      return null;
    }

    // Update last_used_at in authorization log
    this.db.prepare(`
      UPDATE authorization_log SET last_used_at = datetime('now')
      WHERE user_id = ? AND client_id = ?
    `).run(record.userId, record.clientId);

    return record;
  }

  /**
   * Validate an access token and return the user ID.
   */
  validateToken(accessToken: string): string | null {
    const record = this.tokens.get(accessToken);
    if (!record) return null;

    if (Date.now() > record.expiresAt) {
      this.tokens.delete(accessToken);
      return null;
    }

    // Update last_used_at in authorization log
    this.db.prepare(`
      UPDATE authorization_log SET last_used_at = datetime('now')
      WHERE user_id = ? AND client_id = ?
    `).run(record.userId, record.clientId);

    return record.userId;
  }

  /**
   * Revoke an access token.
   */
  revokeToken(accessToken: string): boolean {
    return this.tokens.delete(accessToken);
  }

  /**
   * Log an OAuth authorization event.
   */
  private logAuthorization(userId: string, clientId: string, ipAddress?: string, userAgent?: string): void {
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
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

    for (const [token, record] of this.tokens) {
      if (now > record.expiresAt) this.tokens.delete(token);
    }
  }
}
