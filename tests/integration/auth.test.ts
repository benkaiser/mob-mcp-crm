import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { AccountService } from '../../src/auth/accounts.js';
import { OAuthService, verifyPkce } from '../../src/auth/oauth.js';
import { createTestDatabase } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('AccountService', () => {
  let db: Database.Database;
  let service: AccountService;

  beforeEach(() => {
    db = createTestDatabase();
    service = new AccountService(db);
  });

  afterEach(() => closeDatabase(db));

  it('should create an account', async () => {
    const user = await service.createAccount({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'secure123',
    });

    expect(user.name).toBe('Alice');
    expect(user.email).toBe('alice@example.com');
    expect(user.id).toBeDefined();
    expect(user.created_at).toBeDefined();
    // Should not expose password hash
    expect((user as any).password_hash).toBeUndefined();
  });

  it('should reject duplicate emails', async () => {
    await service.createAccount({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'secure123',
    });

    await expect(
      service.createAccount({
        name: 'Alice 2',
        email: 'alice@example.com',
        password: 'different',
      }),
    ).rejects.toThrow('already exists');
  });

  it('should login with correct credentials', async () => {
    await service.createAccount({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'mypassword',
    });

    const user = await service.login('bob@example.com', 'mypassword');
    expect(user).not.toBeNull();
    expect(user!.name).toBe('Bob');
  });

  it('should reject login with wrong password', async () => {
    await service.createAccount({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'mypassword',
    });

    const user = await service.login('bob@example.com', 'wrongpassword');
    expect(user).toBeNull();
  });

  it('should reject login with non-existent email', async () => {
    const user = await service.login('nobody@example.com', 'whatever');
    expect(user).toBeNull();
  });

  it('should get public user by id', async () => {
    const created = await service.createAccount({
      name: 'Charlie',
      email: 'charlie@example.com',
      password: 'pass',
    });

    const fetched = service.getPublicUser(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Charlie');
    expect(fetched!.email).toBe('charlie@example.com');
  });
});

describe('PKCE Verification', () => {
  it('should verify S256 code challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    expect(verifyPkce(verifier, challenge, 'S256')).toBe(true);
  });

  it('should reject wrong S256 verifier', () => {
    const verifier = 'correct-verifier';
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    expect(verifyPkce('wrong-verifier', challenge, 'S256')).toBe(false);
  });

  it('should verify plain code challenge', () => {
    const verifier = 'my-plain-verifier';
    expect(verifyPkce(verifier, verifier, 'plain')).toBe(true);
  });

  it('should reject wrong plain verifier', () => {
    expect(verifyPkce('wrong', 'correct', 'plain')).toBe(false);
  });
});

describe('OAuthService', () => {
  let db: Database.Database;
  let accounts: AccountService;
  let oauth: OAuthService;
  let userId: string;

  const codeVerifier = 'test-code-verifier-that-is-long-enough';
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  beforeEach(async () => {
    db = createTestDatabase();
    accounts = new AccountService(db);
    oauth = new OAuthService(db, accounts);

    const user = await accounts.createAccount({
      name: 'Test User',
      email: 'test@example.com',
      password: 'testpass',
    });
    userId = user.id;
  });

  afterEach(() => closeDatabase(db));

  it('should create and exchange authorization code', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    expect(code).toBeDefined();
    expect(code.length).toBeGreaterThan(0);

    const token = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });

    expect(token).not.toBeNull();
    expect(token!.access_token).toBeDefined();
    expect(token!.token_type).toBe('Bearer');
    expect(token!.expires_in).toBeGreaterThan(0);
  });

  it('should reject reuse of authorization code', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    // First exchange should succeed
    const token = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });
    expect(token).not.toBeNull();

    // Second exchange should fail (code already consumed)
    const token2 = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });
    expect(token2).toBeNull();
  });

  it('should reject wrong code verifier', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    const token = oauth.exchangeCode({
      code,
      codeVerifier: 'wrong-verifier',
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });

    expect(token).toBeNull();
  });

  it('should reject mismatched client_id', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'client-a',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    const token = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'client-b',
      redirectUri: 'http://localhost/callback',
    });

    expect(token).toBeNull();
  });

  it('should reject mismatched redirect_uri', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    const token = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://evil.com/callback',
    });

    expect(token).toBeNull();
  });

  it('should validate access tokens', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    const token = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });

    const validatedUserId = oauth.validateToken(token!.access_token);
    expect(validatedUserId).toBe(userId);
  });

  it('should reject invalid tokens', () => {
    const validatedUserId = oauth.validateToken('nonexistent-token');
    expect(validatedUserId).toBeNull();
  });

  it('should revoke tokens', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    const token = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });

    expect(oauth.revokeToken(token!.access_token)).toBe(true);
    expect(oauth.validateToken(token!.access_token)).toBeNull();
  });

  it('should log authorization events', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    const logs = db.prepare(
      'SELECT * FROM authorization_log WHERE user_id = ?'
    ).all(userId) as any[];

    expect(logs).toHaveLength(1);
    expect(logs[0].client_id).toBe('test-client');
    expect(logs[0].ip_address).toBe('127.0.0.1');
    expect(logs[0].user_agent).toBe('TestAgent/1.0');
  });

  it('should support plain PKCE method', () => {
    const plainVerifier = 'my-plain-verifier';

    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge: plainVerifier,
      codeChallengeMethod: 'plain',
      redirectUri: 'http://localhost/callback',
    });

    const token = oauth.exchangeCode({
      code,
      codeVerifier: plainVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });

    expect(token).not.toBeNull();
  });

  it('should persist tokens across service restarts (new OAuthService instance with same DB)', () => {
    const code = oauth.createAuthorizationCode({
      userId,
      clientId: 'test-client',
      codeChallenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'http://localhost/callback',
    });

    const token = oauth.exchangeCode({
      code,
      codeVerifier,
      clientId: 'test-client',
      redirectUri: 'http://localhost/callback',
    });

    expect(token).not.toBeNull();

    // Simulate a server restart by creating a new OAuthService with the same DB
    const oauth2 = new OAuthService(db, accounts);

    // Token should still be valid after "restart"
    expect(oauth2.validateToken(token!.access_token)).toBe(userId);
    expect(oauth2.getTokenRecord(token!.access_token)).not.toBeNull();
  });
});
