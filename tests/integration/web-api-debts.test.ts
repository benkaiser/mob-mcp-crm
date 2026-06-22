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

async function makeClient(srv: ReturnType<typeof createServer>, email = 'auth@test.dev', plan = 'unlimited'): Promise<Client> {
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

async function makeContact(c: Client, first = 'Bingo'): Promise<string> {
  const r = await c.mutate('POST', '/web/api/contacts', { first_name: first });
  return JSON.parse(r.body).data.id;
}

describe('Debts internal API (/web/api/debts)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('requires authentication', async () => {
    server = createServer(persistent);
    const res = await raw(server.app, 'GET', '/web/api/debts');
    expect(res.status).toBe(401);
  });

  it('creates, gets, updates, lists, deletes and restores a debt', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const contactId = await makeContact(c);

    const create = await c.mutate('POST', '/web/api/debts', {
      contact_id: contactId, amount: 50, direction: 'they_owe_me', reason: 'Lunch',
    });
    expect(create.status).toBe(201);
    const id = JSON.parse(create.body).data.id;

    const get = await c.get(`/web/api/debts/${id}`);
    expect(get.status).toBe(200);

    const upd = await c.mutate('PATCH', `/web/api/debts/${id}`, { amount: 75 });
    expect(upd.status).toBe(200);
    expect(JSON.parse(upd.body).data.amount).toBe(75);

    const list = await c.get(`/web/api/debts?contact_id=${contactId}`);
    expect(list.status).toBe(200);
    expect(JSON.parse(list.body).meta.total).toBeGreaterThanOrEqual(1);

    const del = await c.mutate('DELETE', `/web/api/debts/${id}`);
    expect(del.status).toBe(200);

    const gone = await c.get(`/web/api/debts/${id}`);
    expect(gone.status).toBe(404);

    const restore = await c.mutate('POST', `/web/api/debts/${id}/restore`);
    expect(restore.status).toBe(200);
  });

  it('settles a debt and returns a summary', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const contactId = await makeContact(c);

    const create = await c.mutate('POST', '/web/api/debts', { contact_id: contactId, amount: 30, direction: 'they_owe_me' });
    const id = JSON.parse(create.body).data.id;

    const summaryBefore = await c.get(`/web/api/debts/summary?contact_id=${contactId}`);
    expect(summaryBefore.status).toBe(200);
    expect(Array.isArray(JSON.parse(summaryBefore.body).data)).toBe(true);

    const settle = await c.mutate('POST', `/web/api/debts/${id}/settle`);
    expect(settle.status).toBe(200);
    expect(JSON.parse(settle.body).data.status).toBe('settled');
  });

  it('returns 404 for a missing debt', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.get('/web/api/debts/nope');
    expect(res.status).toBe(404);
  });

  it('returns 422 on validation error (missing amount)', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const contactId = await makeContact(c);
    const res = await c.mutate('POST', '/web/api/debts', { contact_id: contactId, direction: 'they_owe_me' });
    expect(res.status).toBe(422);
  });
});
