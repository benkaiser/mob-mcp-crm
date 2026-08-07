import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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

/** Client metadata as submitted to the dynamic registration endpoint (RFC 7591). */
export interface ClientRegistrationRequest {
  redirect_uris?: unknown;
  client_name?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  token_endpoint_auth_method?: unknown;
  scope?: unknown;
  client_uri?: unknown;
  logo_uri?: unknown;
  software_id?: unknown;
  software_version?: unknown;
}

/** A registered OAuth client, as stored by the server. */
export interface RegisteredClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  scope: string | null;
  clientUri: string | null;
  logoUri: string | null;
  softwareId: string | null;
  softwareVersion: string | null;
  createdAt: number;
  hasSecret: boolean;
}

/** RFC 7591 registration error, carrying the OAuth error code to return. */
export class ClientRegistrationError extends Error {
  constructor(public readonly code: 'invalid_redirect_uri' | 'invalid_client_metadata', message: string) {
    super(message);
    this.name = 'ClientRegistrationError';
  }
}

const SUPPORTED_GRANT_TYPES = ['authorization_code'];
const SUPPORTED_RESPONSE_TYPES = ['code'];
const SUPPORTED_AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'];

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function asStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ClientRegistrationError('invalid_client_metadata', `${field} must be an array of strings`);
  }
  return value as string[];
}

function asOptionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ClientRegistrationError('invalid_client_metadata', `${field} must be a string`);
  }
  return value;
}

/**
 * Redirect URIs must be absolute. Loopback HTTP and custom app schemes are
 * allowed (native MCP clients rely on both); other plain-HTTP hosts are not.
 */
function isValidRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'http:') {
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  }
  return Boolean(url.protocol && url.protocol !== ':');
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

const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export class OAuthService {
  private authCodes: Map<string, AuthorizationCode> = new Map();

  constructor(
    private db: Database.Database,
    private accounts: AccountService,
  ) {}

  /**
   * Register a client dynamically (RFC 7591). MCP clients call this before
   * starting the authorization flow, since they can't be pre-provisioned on a
   * self-hosted server. Returns the client information response to send back.
   */
  registerClient(metadata: ClientRegistrationRequest): Record<string, unknown> {
    const redirectUris = asStringArray(metadata.redirect_uris, 'redirect_uris');
    if (!redirectUris || redirectUris.length === 0) {
      throw new ClientRegistrationError('invalid_redirect_uri', 'redirect_uris is required and must contain at least one URI');
    }
    for (const uri of redirectUris) {
      if (!isValidRedirectUri(uri)) {
        throw new ClientRegistrationError('invalid_redirect_uri', `Invalid redirect_uri: ${uri}`);
      }
    }

    const grantTypes = asStringArray(metadata.grant_types, 'grant_types') ?? ['authorization_code'];
    for (const grant of grantTypes) {
      if (!SUPPORTED_GRANT_TYPES.includes(grant)) {
        throw new ClientRegistrationError('invalid_client_metadata', `Unsupported grant_type: ${grant}`);
      }
    }

    const responseTypes = asStringArray(metadata.response_types, 'response_types') ?? ['code'];
    for (const responseType of responseTypes) {
      if (!SUPPORTED_RESPONSE_TYPES.includes(responseType)) {
        throw new ClientRegistrationError('invalid_client_metadata', `Unsupported response_type: ${responseType}`);
      }
    }

    const authMethod = asOptionalString(metadata.token_endpoint_auth_method, 'token_endpoint_auth_method') ?? 'none';
    if (!SUPPORTED_AUTH_METHODS.includes(authMethod)) {
      throw new ClientRegistrationError('invalid_client_metadata', `Unsupported token_endpoint_auth_method: ${authMethod}`);
    }

    const clientId = `mcp_${randomBytes(16).toString('hex')}`;
    const clientSecret = authMethod === 'none' ? null : randomBytes(32).toString('hex');
    const createdAt = Date.now();

    this.db.prepare(`
      INSERT INTO oauth_clients (
        client_id, client_secret_hash, client_name, redirect_uris, grant_types,
        response_types, token_endpoint_auth_method, scope, client_uri, logo_uri,
        software_id, software_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      clientSecret ? hashSecret(clientSecret) : null,
      asOptionalString(metadata.client_name, 'client_name'),
      JSON.stringify(redirectUris),
      JSON.stringify(grantTypes),
      JSON.stringify(responseTypes),
      authMethod,
      asOptionalString(metadata.scope, 'scope'),
      asOptionalString(metadata.client_uri, 'client_uri'),
      asOptionalString(metadata.logo_uri, 'logo_uri'),
      asOptionalString(metadata.software_id, 'software_id'),
      asOptionalString(metadata.software_version, 'software_version'),
      createdAt,
    );

    const response: Record<string, unknown> = {
      client_id: clientId,
      client_id_issued_at: Math.floor(createdAt / 1000),
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: authMethod,
    };
    const clientName = asOptionalString(metadata.client_name, 'client_name');
    if (clientName) response.client_name = clientName;
    if (clientSecret) {
      response.client_secret = clientSecret;
      // Secrets don't expire; 0 is the RFC 7591 value for "never".
      response.client_secret_expires_at = 0;
    }
    return response;
  }

  /**
   * Look up a dynamically registered client. Returns null for unknown clients
   * (which are still accepted, for backwards compatibility with clients that
   * use a pre-agreed client_id and never registered).
   */
  getClient(clientId: string): RegisteredClient | null {
    const row = this.db.prepare(`
      SELECT client_id, client_secret_hash, client_name, redirect_uris, grant_types,
             response_types, token_endpoint_auth_method, scope, client_uri, logo_uri,
             software_id, software_version, created_at
      FROM oauth_clients WHERE client_id = ?
    `).get(clientId) as Record<string, any> | undefined;

    if (!row) return null;

    return {
      clientId: row.client_id,
      clientName: row.client_name,
      redirectUris: JSON.parse(row.redirect_uris) as string[],
      grantTypes: JSON.parse(row.grant_types) as string[],
      responseTypes: JSON.parse(row.response_types) as string[],
      tokenEndpointAuthMethod: row.token_endpoint_auth_method,
      scope: row.scope,
      clientUri: row.client_uri,
      logoUri: row.logo_uri,
      softwareId: row.software_id,
      softwareVersion: row.software_version,
      createdAt: row.created_at,
      hasSecret: Boolean(row.client_secret_hash),
    };
  }

  /** Verify a registered client's secret (constant-time comparison of hashes). */
  verifyClientSecret(clientId: string, secret: string): boolean {
    const row = this.db.prepare('SELECT client_secret_hash FROM oauth_clients WHERE client_id = ?')
      .get(clientId) as { client_secret_hash: string | null } | undefined;
    if (!row?.client_secret_hash) return false;
    const expected = Buffer.from(row.client_secret_hash, 'hex');
    const actual = Buffer.from(hashSecret(secret), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /**
   * Check that a redirect_uri is allowed for a client. Unregistered clients are
   * unconstrained (legacy behaviour); registered ones must use an exact match.
   */
  isRedirectUriAllowed(clientId: string, redirectUri: string): boolean {
    const client = this.getClient(clientId);
    if (!client) return true;
    return client.redirectUris.includes(redirectUri);
  }

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
   * List a user's connected clients (e.g. AI assistants), grouped by client_id.
   * Combines live token data with the authorization log for first-authorized
   * and last-used timestamps. Only active (unexpired) tokens are counted.
   */
  listConnectionsForUser(userId: string): Array<{
    clientId: string;
    tokenCount: number;
    authorizedAt: string | null;
    lastUsedAt: string | null;
    expiresAt: number;
  }> {
    const now = Date.now();
    const rows = this.db.prepare(`
      SELECT t.client_id AS clientId,
             COUNT(*) AS tokenCount,
             MAX(t.expires_at) AS expiresAt,
             MIN(l.authorized_at) AS authorizedAt,
             MAX(l.last_used_at) AS lastUsedAt
      FROM oauth_tokens t
      LEFT JOIN authorization_log l
        ON l.user_id = t.user_id AND l.client_id = t.client_id
      WHERE t.user_id = ? AND t.expires_at > ?
      GROUP BY t.client_id
      ORDER BY lastUsedAt DESC
    `).all(userId, now) as Array<{
      clientId: string; tokenCount: number; expiresAt: number;
      authorizedAt: string | null; lastUsedAt: string | null;
    }>;
    return rows;
  }

  /**
   * Revoke all of a user's access tokens for a given client (user-scoped, so a
   * user can only ever revoke their own connections). Returns the count removed.
   */
  revokeConnection(userId: string, clientId: string): number {
    return this.db.prepare('DELETE FROM oauth_tokens WHERE user_id = ? AND client_id = ?')
      .run(userId, clientId).changes;
  }

  /**
   * Revoke every access token for a user, across all connected clients.
   * Used after a security-sensitive event (password change/reset) so that
   * an attacker who compromised the account can't keep MCP access via a
   * still-valid OAuth token. Returns the count removed.
   */
  revokeAllForUser(userId: string): number {
    return this.db.prepare('DELETE FROM oauth_tokens WHERE user_id = ?').run(userId).changes;
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
