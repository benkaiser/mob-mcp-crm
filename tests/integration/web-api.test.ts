import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';

interface InjectedResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function inject(
  app: Express,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<InjectedResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => { server.close(); resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers }); });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (opts.body) req.write(JSON.stringify(opts.body));
      req.end();
    });
  });
}

/** Extract a cookie value from a Set-Cookie header array. */
function cookieFrom(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers['set-cookie'] ?? [];
  for (const c of raw) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return undefined;
}

const forgetfulConfig: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' };

describe('Internal Web API (/web/api)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  /** Log in via forgetful auto-login and return the mob_session cookie value. */
  async function loginForgetful(app: Express): Promise<string> {
    const res = await inject(app, 'GET', '/web/login');
    const session = cookieFrom(res.headers, 'mob_session');
    if (!session) throw new Error('no session cookie issued');
    return session;
  }

  it('returns 401 JSON when unauthenticated (no redirect)', async () => {
    server = createServer(forgetfulConfig);
    const res = await inject(server.app, 'GET', '/web/api/me');
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('unauthorized');
  });

  it('GET /web/api/me returns the current user envelope', async () => {
    server = createServer(forgetfulConfig);
    const session = await loginForgetful(server.app);
    const res = await inject(server.app, 'GET', '/web/api/me', {
      headers: { Cookie: `mob_session=${session}` },
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.data.name).toBe('Bluey Heeler');
    // Self-hosted/forgetful → unlimited, no cap
    expect(body.data.plan).toBe('unlimited');
    expect(body.data.hosted).toBe(false);
    expect(body.data.beta).toBe(false);
    expect(body.data.usage.contact_cap).toBeNull();
    expect(body.data.entitlements.public_api).toBe(true);
  });

  it('GET /web/api/me reports beta=true when ENV=production', async () => {
    server = createServer(forgetfulConfig);
    const session = await loginForgetful(server.app);
    const prev = process.env.ENV;
    process.env.ENV = 'production';
    try {
      const res = await inject(server.app, 'GET', '/web/api/me', {
        headers: { Cookie: `mob_session=${session}` },
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body).data.beta).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.ENV;
      else process.env.ENV = prev;
    }
  });

  it('issues a CSRF cookie on safe requests', async () => {
    server = createServer(forgetfulConfig);
    const session = await loginForgetful(server.app);
    const res = await inject(server.app, 'GET', '/web/api/me', {
      headers: { Cookie: `mob_session=${session}` },
    });
    expect(cookieFrom(res.headers, 'mob_csrf')).toBeDefined();
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    server = createServer(forgetfulConfig);
    const session = await loginForgetful(server.app);
    // POST to a non-existent route still passes through CSRF middleware first.
    const res = await inject(server.app, 'POST', '/web/api/me', {
      headers: { Cookie: `mob_session=${session}` },
      body: {},
    });
    expect(res.status).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('csrf_failed');
  });

  it('accepts state-changing requests with matching CSRF cookie + header', async () => {
    server = createServer(forgetfulConfig);
    const session = await loginForgetful(server.app);
    // First GET to obtain a CSRF cookie.
    const getRes = await inject(server.app, 'GET', '/web/api/me', {
      headers: { Cookie: `mob_session=${session}` },
    });
    const csrf = cookieFrom(getRes.headers, 'mob_csrf')!;
    // POST with matching token → passes CSRF; route doesn't exist so 404 (not 403).
    const res = await inject(server.app, 'POST', '/web/api/does-not-exist', {
      headers: { Cookie: `mob_session=${session}; mob_csrf=${csrf}`, 'X-CSRF-Token': csrf },
      body: {},
    });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404);
  });
});
