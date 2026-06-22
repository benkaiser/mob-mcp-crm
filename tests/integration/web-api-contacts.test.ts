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

/** Helper bundling a session + CSRF token for an authenticated test user. */
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
  // Obtain a CSRF cookie via a GET on the API.
  const me = await raw(srv.app, 'GET', '/web/api/me', { headers: { Cookie: `mob_session=${session}` } });
  const csrf = cookieFrom(me.headers, 'mob_csrf');
  if (!csrf) throw new Error('no csrf');
  return new Client(srv.app, session, csrf);
}

describe('Contacts internal API (/web/api/contacts)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('requires authentication', async () => {
    server = createServer(persistent);
    const res = await raw(server.app, 'GET', '/web/api/contacts');
    expect(res.status).toBe(401);
  });

  it('creates, gets, updates, lists, deletes and restores a contact', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);

    // Create
    const create = await c.mutate('POST', '/web/api/contacts', { first_name: 'Chilli', last_name: 'Heeler' });
    expect(create.status).toBe(201);
    const created = JSON.parse(create.body).data;
    expect(created.first_name).toBe('Chilli');
    const id = created.id;

    // Get enriched profile
    const get = await c.get(`/web/api/contacts/${id}`);
    expect(get.status).toBe(200);
    const profile = JSON.parse(get.body).data;
    expect(profile.first_name).toBe('Chilli');
    expect(profile).toHaveProperty('contact_methods');
    expect(profile).toHaveProperty('tags');
    expect(profile).toHaveProperty('debt_summary');

    // Update
    const upd = await c.mutate('PATCH', `/web/api/contacts/${id}`, { job_title: 'Airport Security' });
    expect(upd.status).toBe(200);
    expect(JSON.parse(upd.body).data.job_title).toBe('Airport Security');

    // List (should include the contact + the self-contact created at signup)
    const list = await c.get('/web/api/contacts');
    expect(list.status).toBe(200);
    const listBody = JSON.parse(list.body);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.meta.total).toBeGreaterThanOrEqual(1);
    expect(listBody.meta.page).toBe(1);

    // Delete (soft)
    const del = await c.mutate('DELETE', `/web/api/contacts/${id}`);
    expect(del.status).toBe(200);
    expect(JSON.parse(del.body).data.deleted).toBe(true);

    // Get after delete → 404
    const gone = await c.get(`/web/api/contacts/${id}`);
    expect(gone.status).toBe(404);

    // Restore
    const restore = await c.mutate('POST', `/web/api/contacts/${id}/restore`);
    expect(restore.status).toBe(200);
    expect(JSON.parse(restore.body).data.id).toBe(id);
  });

  it('returns 404 for a missing contact', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.get('/web/api/contacts/does-not-exist');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('not_found');
  });

  it('returns 422 on validation error (missing first_name)', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.mutate('POST', '/web/api/contacts', { last_name: 'NoFirst' });
    expect(res.status).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('validation_error');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('supports search filter', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    await c.mutate('POST', '/web/api/contacts', { first_name: 'Bingo', last_name: 'Heeler' });
    await c.mutate('POST', '/web/api/contacts', { first_name: 'Muffin', last_name: 'Cupcake' });
    const res = await c.get('/web/api/contacts?search=Bingo');
    const body = JSON.parse(res.body);
    expect(body.data.some((x: { first_name: string }) => x.first_name === 'Bingo')).toBe(true);
    expect(body.data.some((x: { first_name: string }) => x.first_name === 'Muffin')).toBe(false);
  });

  it('enforces the contact quota in hosted free mode', async () => {
    server = createServer(hosted);
    const c = await makeClient(server, 'free@test.dev', 'free');
    // Signup already created 1 self-contact. Free cap = 11 → add up to 10 more.
    for (let i = 0; i < 10; i++) {
      const r = await c.mutate('POST', '/web/api/contacts', { first_name: `C${i}` });
      expect(r.status).toBe(201);
    }
    // 12th contact (11 + self = over cap) → 402
    const over = await c.mutate('POST', '/web/api/contacts', { first_name: 'Overflow' });
    expect(over.status).toBe(402);
    expect(JSON.parse(over.body).error.code).toBe('quota_exceeded');
  });

  it('does NOT enforce the quota in self-hosted mode', async () => {
    server = createServer(persistent); // hosted = false
    const c = await makeClient(server, 'unlimited@test.dev', 'free'); // plan ignored when self-hosted
    for (let i = 0; i < 15; i++) {
      const r = await c.mutate('POST', '/web/api/contacts', { first_name: `U${i}` });
      expect(r.status).toBe(201);
    }
  });
});
