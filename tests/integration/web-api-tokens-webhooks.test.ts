import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';

interface Res { status: number; body: string; headers: http.IncomingHttpHeaders }

function raw(
  app: Express,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string>; form?: Record<string, string> } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      let payload: string | undefined;
      if (opts.form) { payload = new URLSearchParams(opts.form).toString(); headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
      else if (opts.body !== undefined) { payload = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
      const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method, headers }, (r) => {
        let data = '';
        r.on('data', (c: Buffer) => { data += c.toString(); });
        r.on('end', () => { server.close(); resolve({ status: r.statusCode ?? 0, body: data, headers: r.headers }); });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function cookieFrom(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  for (const c of headers['set-cookie'] ?? []) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m && m[1].length > 0) return m[1];
  }
  return undefined;
}

const persistent: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' };
const hosted: ServerConfig = { ...persistent, hosted: true };

class Client {
  constructor(private app: Express, public session: string, public csrf: string) {}
  get(path: string) {
    return raw(this.app, 'GET', path, { headers: { Cookie: `mob_session=${this.session}; mob_csrf=${this.csrf}` } });
  }
  mutate(method: string, path: string, body?: unknown) {
    return raw(this.app, method, path, {
      headers: { Cookie: `mob_session=${this.session}; mob_csrf=${this.csrf}`, 'X-CSRF-Token': this.csrf },
      body,
    });
  }
}

async function makeClient(srv: ReturnType<typeof createServer>, email = 'tok@test.dev', plan = 'unlimited'): Promise<Client> {
  const accounts = new AccountService(srv.db);
  await accounts.createAccount({ name: 'Test User', email, password: 'password123', plan });
  const login = await raw(srv.app, 'POST', '/web/login', { form: { email, password: 'password123' } });
  const session = cookieFrom(login.headers, 'mob_session');
  if (!session) throw new Error('login failed');
  const me = await raw(srv.app, 'GET', '/web/api/me', { headers: { Cookie: `mob_session=${session}` } });
  const csrf = cookieFrom(me.headers, 'mob_csrf');
  if (!csrf) throw new Error('no csrf');
  return new Client(srv.app, session, csrf);
}

describe('API tokens internal API (/web/api/tokens)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('creates, lists (masked) and revokes a token (self-hosted)', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);

    const create = await c.mutate('POST', '/web/api/tokens', { name: 'My CLI' });
    expect(create.status).toBe(201);
    const created = JSON.parse(create.body).data;
    expect(created.token).toMatch(/^mob_/);
    expect(created.name).toBe('My CLI');

    const list = await c.get('/web/api/tokens');
    expect(list.status).toBe(200);
    const rows = JSON.parse(list.body).data;
    expect(rows.length).toBe(1);
    expect(rows[0].token).toBeUndefined(); // masked
    expect(rows[0].prefix).toBeTruthy();

    const del = await c.mutate('DELETE', `/web/api/tokens/${created.id}`);
    expect(del.status).toBe(200);
    expect(JSON.parse(del.body).data.revoked).toBe(true);
  });

  it('is allowed for hosted free plans during beta', async () => {
    server = createServer(hosted);
    const c = await makeClient(server, 'free@test.dev', 'free');
    const res = await c.mutate('POST', '/web/api/tokens', { name: 'Beta Free' });
    expect(res.status).toBe(201);
  });

  it('is allowed for hosted paid plans', async () => {
    server = createServer(hosted);
    const c = await makeClient(server, 'paid@test.dev', 'paid');
    const res = await c.mutate('POST', '/web/api/tokens', { name: 'Yes' });
    expect(res.status).toBe(201);
  });
});

describe('Webhooks internal API (/web/api/webhooks)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('creates, lists, updates and deletes a webhook (self-hosted)', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);

    const create = await c.mutate('POST', '/web/api/webhooks', {
      url: 'https://example.com/hook', events: ['contact.created'],
    });
    expect(create.status).toBe(201);
    const hook = JSON.parse(create.body).data;
    expect(hook.url).toBe('https://example.com/hook');
    expect(hook.secret).toBeTruthy();

    const list = await c.get('/web/api/webhooks');
    expect(JSON.parse(list.body).data.length).toBe(1);

    const upd = await c.mutate('PATCH', `/web/api/webhooks/${hook.id}`, { active: false });
    expect(upd.status).toBe(200);
    expect(JSON.parse(upd.body).data.active).toBe(0);

    const deliveries = await c.get(`/web/api/webhooks/${hook.id}/deliveries`);
    expect(deliveries.status).toBe(200);
    expect(Array.isArray(JSON.parse(deliveries.body).data)).toBe(true);

    const del = await c.mutate('DELETE', `/web/api/webhooks/${hook.id}`);
    expect(del.status).toBe(200);
    expect(JSON.parse(del.body).data.deleted).toBe(true);
  });

  it('rejects invalid url with 422', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.mutate('POST', '/web/api/webhooks', { url: 'not-a-url', events: '*' });
    expect(res.status).toBe(422);
  });

  it('is allowed for hosted free plans during beta', async () => {
    server = createServer(hosted);
    const c = await makeClient(server, 'freew@test.dev', 'free');
    const res = await c.get('/web/api/webhooks');
    expect(res.status).toBe(200);
  });
});
