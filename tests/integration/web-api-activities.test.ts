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

describe('Activities internal API (/web/api/activities)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('requires authentication', async () => {
    server = createServer(persistent);
    const res = await raw(server.app, 'GET', '/web/api/activities');
    expect(res.status).toBe(401);
  });

  it('creates, gets, updates, lists, deletes and restores an activity', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const contactId = await makeContact(c);

    const create = await c.mutate('POST', '/web/api/activities', {
      type: 'phone_call', title: 'Caught up', occurred_at: '2026-01-01T10:00:00Z',
      participant_contact_ids: [contactId],
    });
    expect(create.status).toBe(201);
    const id = JSON.parse(create.body).data.id;
    expect(JSON.parse(create.body).data.participants).toContain(contactId);

    const get = await c.get(`/web/api/activities/${id}`);
    expect(get.status).toBe(200);

    const upd = await c.mutate('PATCH', `/web/api/activities/${id}`, { title: 'Renamed' });
    expect(upd.status).toBe(200);
    expect(JSON.parse(upd.body).data.title).toBe('Renamed');

    const list = await c.get(`/web/api/activities?contact_id=${contactId}`);
    expect(list.status).toBe(200);
    expect(JSON.parse(list.body).meta.total).toBeGreaterThanOrEqual(1);

    const del = await c.mutate('DELETE', `/web/api/activities/${id}`);
    expect(del.status).toBe(200);

    const gone = await c.get(`/web/api/activities/${id}`);
    expect(gone.status).toBe(404);

    const restore = await c.mutate('POST', `/web/api/activities/${id}/restore`);
    expect(restore.status).toBe(200);
    expect(JSON.parse(restore.body).data.id).toBe(id);
  });

  it('returns 404 for a missing activity', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.get('/web/api/activities/nope');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('not_found');
  });

  it('returns 422 on validation error (missing occurred_at)', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.mutate('POST', '/web/api/activities', { type: 'phone_call', participant_contact_ids: [] });
    expect(res.status).toBe(422);
    expect(JSON.parse(res.body).error.code).toBe('validation_error');
  });

  it('manages activity types', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);

    const create = await c.mutate('POST', '/web/api/activities/types', { name: 'Hiking', category: 'outdoor' });
    expect(create.status).toBe(201);
    const typeId = JSON.parse(create.body).data.id;

    const list = await c.get('/web/api/activities/types');
    expect(list.status).toBe(200);
    expect(JSON.parse(list.body).data.some((t: { id: string }) => t.id === typeId)).toBe(true);

    const upd = await c.mutate('PATCH', `/web/api/activities/types/${typeId}`, { name: 'Trekking' });
    expect(upd.status).toBe(200);
    expect(JSON.parse(upd.body).data.name).toBe('Trekking');

    const del = await c.mutate('DELETE', `/web/api/activities/types/${typeId}`);
    expect(del.status).toBe(200);
    expect(JSON.parse(del.body).data.deleted).toBe(true);
  });
});
