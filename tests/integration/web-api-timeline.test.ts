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

describe('Timeline internal API (/web/api/timeline)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('requires authentication', async () => {
    server = createServer(persistent);
    const res = await raw(server.app, 'GET', '/web/api/timeline?contact_id=x');
    expect(res.status).toBe(401);
  });

  it('returns a unified timeline for a contact', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const contactId = await makeContact(c);

    await c.mutate('POST', '/web/api/notes', { contact_id: contactId, body: 'A note' });

    const list = await c.get(`/web/api/timeline?contact_id=${contactId}`);
    expect(list.status).toBe(200);
    const body = JSON.parse(list.body);
    expect(Array.isArray(body.data)).toBe(true);
    // contact_created + the note
    expect(body.meta.total).toBeGreaterThanOrEqual(2);

    const filtered = await c.get(`/web/api/timeline?contact_id=${contactId}&entry_type=note`);
    expect(filtered.status).toBe(200);
    expect(JSON.parse(filtered.body).data.every((e: { type: string }) => e.type === 'note')).toBe(true);
  });

  it('returns 422 when contact_id missing', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.get('/web/api/timeline');
    expect(res.status).toBe(422);
  });

  it('returns 404 for a contact that is not owned', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.get('/web/api/timeline?contact_id=nope');
    expect(res.status).toBe(404);
  });
});
