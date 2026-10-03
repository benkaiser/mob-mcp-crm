import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';

describe('Forgetful Mode', () => {
  let serverInstance: ReturnType<typeof createServer>;

  afterEach(() => {
    if (serverInstance) {
      serverInstance.stop();
    }
  });

  it('should start in forgetful mode with in-memory database', () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    expect(serverInstance.db).toBeDefined();
    // In-memory database should be functional
    const result = serverInstance.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should report forgetful mode in health check', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    // Use direct supertest-like approach
    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.mode).toBe('forgetful');
    } finally {
      server.close();
    }
  });

  it('should report persistent mode in health check', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.mode).toBe('persistent');
    } finally {
      server.close();
    }
  });

  it('should reject OAuth in forgetful mode (OAuth is disabled)', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      // In forgetful mode, OAuth authorize should be rejected
      const authResponse = await fetch(`http://localhost:${port}/auth/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'test-client',
          code_challenge: 'test-challenge',
          code_challenge_method: 'plain',
          redirect_uri: 'http://localhost/callback',
        }),
      });

      // Should reject with 404 since OAuth is disabled in forgetful mode
      expect(authResponse.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('should allow direct MCP connection without OAuth in forgetful mode', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      // Connect to /mcp directly - no OAuth needed
      const initResponse = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0' },
          },
        }),
      });

      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.headers.get('mcp-session-id');
      expect(sessionId).toBeDefined();
      expect(sessionId).not.toBeNull();
    } finally {
      server.close();
    }
  });

  it('serves seeded Bluey demo data through the web API after auto-login', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const sessionFrom = (res: Response): string => {
      const raw = res.headers.get('set-cookie') ?? '';
      const m = raw.match(/mob_session=([^;]+)/);
      if (!m) throw new Error('no mob_session cookie issued by /web/login');
      return m[1];
    };

    try {
      // Auto-login clones the seeded template DB for this web session.
      const login = await fetch(`http://localhost:${port}/web/login`, { redirect: 'manual' });
      const session = sessionFrom(login);

      // The web API must see the cloned (seeded) db, not the empty main db.
      const contactsRes = await fetch(`http://localhost:${port}/web/api/contacts?per_page=100`, {
        headers: { Cookie: `mob_session=${session}` },
      });
      expect(contactsRes.status).toBe(200);
      const contacts = await contactsRes.json();
      expect(contacts.meta.total).toBeGreaterThan(0);
      // Bluey herself is part of the seed.
      const names = contacts.data.map((c: { first_name: string }) => c.first_name);
      expect(names).toContain('Bluey');

      // /me usage should reflect the seeded contact count too.
      const meRes = await fetch(`http://localhost:${port}/web/api/me`, {
        headers: { Cookie: `mob_session=${session}` },
      });
      const me = await meRes.json();
      expect(me.data.usage.contacts).toBe(contacts.meta.total);
    } finally {
      server.close();
    }
  });

  it('gives each forgetful web session an isolated cloned database', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const cookies = (res: Response): { session: string; csrf: string } => {
      const raw = res.headers.get('set-cookie') ?? '';
      const s = raw.match(/mob_session=([^;]+)/);
      const c = raw.match(/mob_csrf=([^;]+)/);
      if (!s) throw new Error('no session cookie');
      return { session: s[1], csrf: c ? c[1] : '' };
    };

    try {
      // Two independent auto-logins → two independent clones.
      const l1 = await fetch(`http://localhost:${port}/web/login`, { redirect: 'manual' });
      const s1 = cookies(l1).session;
      const l2 = await fetch(`http://localhost:${port}/web/login`, { redirect: 'manual' });
      const s2 = cookies(l2).session;

      // Need a csrf cookie for the mutation; a GET issues one.
      const csrfRes = await fetch(`http://localhost:${port}/web/api/me`, { headers: { Cookie: `mob_session=${s2}` } });
      const csrf = (csrfRes.headers.get('set-cookie') ?? '').match(/mob_csrf=([^;]+)/)?.[1] ?? '';

      const before = await (await fetch(`http://localhost:${port}/web/api/contacts?per_page=100`, { headers: { Cookie: `mob_session=${s1}` } })).json();
      const total = before.meta.total;

      // Delete a contact in session 2.
      const list2 = await (await fetch(`http://localhost:${port}/web/api/contacts?per_page=1`, { headers: { Cookie: `mob_session=${s2}` } })).json();
      const victimId = list2.data[0].id;
      const del = await fetch(`http://localhost:${port}/web/api/contacts/${victimId}`, {
        method: 'DELETE',
        headers: { Cookie: `mob_session=${s2}; mob_csrf=${csrf}`, 'X-CSRF-Token': csrf },
      });
      expect(del.status).toBe(200);

      // Session 1 is unaffected; session 2 dropped by one.
      const after1 = await (await fetch(`http://localhost:${port}/web/api/contacts?per_page=100`, { headers: { Cookie: `mob_session=${s1}` } })).json();
      const after2 = await (await fetch(`http://localhost:${port}/web/api/contacts?per_page=100`, { headers: { Cookie: `mob_session=${s2}` } })).json();
      expect(after1.meta.total).toBe(total);
      expect(after2.meta.total).toBe(total - 1);
    } finally {
      server.close();
    }
  });

  describe('session memory bounds', () => {
    const listen = async (app: unknown): Promise<{ port: number; close: () => void }> => {
      const { default: http } = await import('node:http');
      const server = http.createServer(app as never);
      await new Promise<void>((resolve) => server.listen(0, resolve));
      return { port: (server.address() as { port: number }).port, close: () => server.close() };
    };

    const sessionCookieOf = (res: Response): string => {
      const m = (res.headers.get('set-cookie') ?? '').match(/mob_session=([^;]+)/);
      if (!m) throw new Error('no mob_session cookie');
      return m[1];
    };

    const sessionCount = async (port: number): Promise<number> => {
      const health = await (await fetch(`http://localhost:${port}/health`)).json();
      return health.sessions.forgetful;
    };

    it('reuses an existing demo session instead of cloning a database per /web/login hit', async () => {
      serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
      const { port, close } = await listen(serverInstance.app);

      try {
        const first = await fetch(`http://localhost:${port}/web/login`, { redirect: 'manual' });
        const session = sessionCookieOf(first);
        expect(await sessionCount(port)).toBe(1);

        // Repeat visits carrying the cookie must not allocate more clones.
        for (let i = 0; i < 5; i++) {
          const again = await fetch(`http://localhost:${port}/web/login`, {
            redirect: 'manual',
            headers: { Cookie: `mob_session=${session}` },
          });
          expect(again.status).toBe(302);
          expect(again.headers.get('location')).toBe('/app/');
        }
        expect(await sessionCount(port)).toBe(1);

        // The reused session still resolves to its seeded clone.
        const contacts = await (await fetch(`http://localhost:${port}/web/api/contacts?per_page=1`, {
          headers: { Cookie: `mob_session=${session}` },
        })).json();
        expect(contacts.meta.total).toBeGreaterThan(0);
      } finally {
        close();
      }
    });

    it('releases the cloned database on logout', async () => {
      serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
      const { port, close } = await listen(serverInstance.app);

      try {
        const login = await fetch(`http://localhost:${port}/web/login`, { redirect: 'manual' });
        const session = sessionCookieOf(login);
        expect(await sessionCount(port)).toBe(1);

        await fetch(`http://localhost:${port}/web/logout`, {
          redirect: 'manual',
          headers: { Cookie: `mob_session=${session}` },
        });
        expect(await sessionCount(port)).toBe(0);
      } finally {
        close();
      }
    });

    it('caps concurrent forgetful sessions, evicting the least recently used', async () => {
      const previous = process.env.MOB_FORGETFUL_MAX_SESSIONS;
      process.env.MOB_FORGETFUL_MAX_SESSIONS = '3';
      serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
      const { port, close } = await listen(serverInstance.app);

      try {
        const sessions: string[] = [];
        for (let i = 0; i < 6; i++) {
          const res = await fetch(`http://localhost:${port}/web/login`, { redirect: 'manual' });
          sessions.push(sessionCookieOf(res));
        }
        expect(await sessionCount(port)).toBe(3);

        // The newest session still works; the oldest was reclaimed and now
        // falls back to the (empty) main database rather than leaking.
        const newest = await (await fetch(`http://localhost:${port}/web/api/contacts?per_page=1`, {
          headers: { Cookie: `mob_session=${sessions[5]}` },
        })).json();
        expect(newest.meta.total).toBeGreaterThan(0);
      } finally {
        close();
        if (previous === undefined) delete process.env.MOB_FORGETFUL_MAX_SESSIONS;
        else process.env.MOB_FORGETFUL_MAX_SESSIONS = previous;
      }
    });

    it('frees an MCP session clone when the client disconnects', async () => {
      serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
      const { port, close } = await listen(serverInstance.app);

      try {
        const init = await fetch(`http://localhost:${port}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
          }),
        });
        const sessionId = init.headers.get('mcp-session-id')!;
        expect(await sessionCount(port)).toBe(1);

        await fetch(`http://localhost:${port}/mcp`, {
          method: 'DELETE',
          headers: { 'mcp-session-id': sessionId },
        });
        expect(await sessionCount(port)).toBe(0);
      } finally {
        close();
      }
    });
  });
});
