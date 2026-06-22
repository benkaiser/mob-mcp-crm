import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';
import { deepLink, buildDeepLink, ENTITY_ROUTES, type DeepLinkEntity } from '../../src/server/deep-links.js';

describe('deep-links', () => {
  let srv: ReturnType<typeof createServer>;
  let accountService: AccountService;
  let userId: string;
  const baseUrl = 'http://localhost:1234';

  beforeEach(async () => {
    srv = createServer({ port: 0, dataDir: ':memory:', forgetful: false, baseUrl });
    accountService = new AccountService(srv.db);
    const user = await accountService.createAccount({
      name: 'Test User',
      email: `test-${Math.random()}@example.com`,
      password: 'password123',
    });
    userId = user.id;
  });

  afterEach(() => {
    srv.stop();
  });

  const entities = Object.keys(ENTITY_ROUTES) as DeepLinkEntity[];

  it('sets base_url in server_config', () => {
    const row = srv.db.prepare("SELECT value FROM server_config WHERE key='base_url'").get() as { value: string };
    expect(row.value).toBe(baseUrl);
  });

  for (const entity of entities) {
    it(`builds a correct URL for entity "${entity}"`, () => {
      const id = 'abc123';
      const url = deepLink(srv.db, accountService, userId, entity, id);
      expect(url).not.toBeNull();
      const parsed = new URL(url!);

      // base + landing endpoint
      expect(`${parsed.protocol}//${parsed.host}`).toBe(baseUrl);
      expect(parsed.pathname).toBe('/web/auto-login');

      // contains a token
      const token = parsed.searchParams.get('token');
      expect(token).toBeTruthy();
      expect(token!.length).toBeGreaterThan(0);

      // redirect param is the right route
      const expectedRoute = ENTITY_ROUTES[entity](id);
      expect(parsed.searchParams.get('redirect')).toBe(expectedRoute);
    });
  }

  it('returns null in forgetful mode', () => {
    const url = deepLink(srv.db, accountService, userId, 'contact', 'abc123', { forgetful: true });
    expect(url).toBeNull();
  });

  it('round-trips the token through consumeAutoLoginToken', () => {
    const url = deepLink(srv.db, accountService, userId, 'contact', 'xyz789');
    const token = new URL(url!).searchParams.get('token')!;
    const consumed = accountService.consumeAutoLoginToken(token);
    expect(consumed).toBe(userId);
    // single-use: second consume fails
    expect(accountService.consumeAutoLoginToken(token)).toBeNull();
  });

  it('buildDeepLink convenience constructs AccountService internally and round-trips', () => {
    const url = buildDeepLink(srv.db, userId, 'gift', 'gift-1');
    expect(url).not.toBeNull();
    const token = new URL(url!).searchParams.get('token')!;
    expect(new AccountService(srv.db).consumeAutoLoginToken(token)).toBe(userId);
  });

  it('encodes the redirect route', () => {
    const url = deepLink(srv.db, accountService, userId, 'life-event', 'le 1');
    expect(url).toContain('redirect=%2Fapp%2Flife-events%2Fle%201');
  });
});
