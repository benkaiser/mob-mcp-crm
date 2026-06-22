import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import express, { type Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';
import { ApiTokenService } from '../../src/services/api-tokens.js';
import { PlanService } from '../../src/services/plans.js';
import { createPublicApiRouter, type PublicApiDeps } from '../../src/server/public-api/index.js';

interface Res { status: number; body: string; headers: http.IncomingHttpHeaders }

function raw(
  app: Express,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      let payload: string | undefined;
      if (opts.body !== undefined) { payload = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json'; }
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

const persistent: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' };
const hostedCfg: ServerConfig = { ...persistent, hosted: true };

/** Spin up a real migrated DB via createServer, then mount a fresh app with the
 *  public API router so we exercise it in isolation with Bearer auth. */
interface Harness {
  app: Express;
  srv: ReturnType<typeof createServer>;
  token: string;
  userId: string;
  selfContactId: string;
}

async function makeHarness(opts: {
  cfg?: ServerConfig;
  plan?: string;
  scopes?: string;
  routerOverrides?: Partial<PublicApiDeps>;
} = {}): Promise<Harness> {
  const cfg = opts.cfg ?? persistent;
  const srv = createServer(cfg);
  const accounts = new AccountService(srv.db);
  const user = await accounts.createAccount({
    name: 'Api User',
    email: `api-${Math.random().toString(36).slice(2)}@test.dev`,
    password: 'password123',
    plan: opts.plan ?? 'unlimited',
  });
  const tokenService = new ApiTokenService(srv.db);
  const created = tokenService.create(user.id, 'test-token', opts.scopes ?? 'read,write');
  const planService = new PlanService(srv.db, cfg.hosted === true);

  const app = express();
  app.use('/api/v1', createPublicApiRouter({
    db: srv.db,
    planService,
    tokenService,
    ...opts.routerOverrides,
  }));

  const selfContact = srv.db.prepare('SELECT id FROM contacts WHERE user_id = ? AND is_me = 1').get(user.id) as { id: string };

  return { app, srv, token: created.token, userId: user.id, selfContactId: selfContact.id };
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe('Public API (/api/v1)', () => {
  let h: Harness | null = null;
  afterEach(() => { if (h) { h.srv.stop(); h = null; } });

  // ─── Auth ──────────────────────────────────────────────────

  it('rejects requests with no token (401)', async () => {
    h = await makeHarness();
    const res = await raw(h.app, 'GET', '/api/v1/contacts');
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('unauthorized');
  });

  it('rejects requests with an invalid token (401)', async () => {
    h = await makeHarness();
    const res = await raw(h.app, 'GET', '/api/v1/contacts', { headers: auth('mob_bogus') });
    expect(res.status).toBe(401);
  });

  it('rejects a revoked token (401)', async () => {
    h = await makeHarness();
    const tokenService = new ApiTokenService(h.srv.db);
    const list = tokenService.list(h.userId);
    tokenService.revoke(h.userId, list[0].id);
    const res = await raw(h.app, 'GET', '/api/v1/contacts', { headers: auth(h.token) });
    expect(res.status).toBe(401);
  });

  it('exposes /me with scopes + plan info', async () => {
    h = await makeHarness();
    const res = await raw(h.app, 'GET', '/api/v1/me', { headers: auth(h.token) });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body).data;
    expect(data.id).toBe(h.userId);
    expect(data.scopes).toContain('read');
    expect(data.scopes).toContain('write');
  });

  // ─── Scopes ────────────────────────────────────────────────

  it('denies a write with a read-only token (403)', async () => {
    h = await makeHarness({ scopes: 'read' });
    const res = await raw(h.app, 'POST', '/api/v1/contacts', { headers: auth(h.token), body: { first_name: 'Nope' } });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('forbidden');
  });

  it('allows reads with a read-only token', async () => {
    h = await makeHarness({ scopes: 'read' });
    const res = await raw(h.app, 'GET', '/api/v1/contacts', { headers: auth(h.token) });
    expect(res.status).toBe(200);
  });

  // ─── Contacts CRUD ─────────────────────────────────────────

  it('runs full contact CRUD + restore under the public envelope', async () => {
    h = await makeHarness();
    const create = await raw(h.app, 'POST', '/api/v1/contacts', { headers: auth(h.token), body: { first_name: 'Chilli', last_name: 'Heeler' } });
    expect(create.status).toBe(201);
    const created = JSON.parse(create.body).data;
    expect(created.first_name).toBe('Chilli');
    const id = created.id;

    const get = await raw(h.app, 'GET', `/api/v1/contacts/${id}`, { headers: auth(h.token) });
    expect(get.status).toBe(200);
    const profile = JSON.parse(get.body).data;
    expect(profile).toHaveProperty('contact_methods');
    expect(profile).toHaveProperty('debt_summary');

    const upd = await raw(h.app, 'PATCH', `/api/v1/contacts/${id}`, { headers: auth(h.token), body: { job_title: 'Security' } });
    expect(upd.status).toBe(200);
    expect(JSON.parse(upd.body).data.job_title).toBe('Security');

    const list = await raw(h.app, 'GET', '/api/v1/contacts', { headers: auth(h.token) });
    const listBody = JSON.parse(list.body);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listBody.meta.total).toBeGreaterThanOrEqual(1);
    expect(listBody.meta.page).toBe(1);

    const del = await raw(h.app, 'DELETE', `/api/v1/contacts/${id}`, { headers: auth(h.token) });
    expect(del.status).toBe(200);
    expect(JSON.parse(del.body).data.deleted).toBe(true);

    const gone = await raw(h.app, 'GET', `/api/v1/contacts/${id}`, { headers: auth(h.token) });
    expect(gone.status).toBe(404);

    const restore = await raw(h.app, 'POST', `/api/v1/contacts/${id}/restore`, { headers: auth(h.token) });
    expect(restore.status).toBe(200);
    expect(JSON.parse(restore.body).data.id).toBe(id);
  });

  it('returns 422 on validation error (missing first_name)', async () => {
    h = await makeHarness();
    const res = await raw(h.app, 'POST', '/api/v1/contacts', { headers: auth(h.token), body: { last_name: 'NoFirst' } });
    expect(res.status).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('validation_error');
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('returns 404 for a missing contact', async () => {
    h = await makeHarness();
    const res = await raw(h.app, 'GET', '/api/v1/contacts/does-not-exist', { headers: auth(h.token) });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('not_found');
  });

  // ─── Contact sub-resources ─────────────────────────────────

  it('manages contact methods + tags sub-resources', async () => {
    h = await makeHarness();
    const cid = h.selfContactId;

    const m = await raw(h.app, 'POST', `/api/v1/contacts/${cid}/methods`, { headers: auth(h.token), body: { type: 'email', value: 'a@b.com', is_primary: true } });
    expect(m.status).toBe(201);
    const methodId = JSON.parse(m.body).data.id;

    const mlist = await raw(h.app, 'GET', `/api/v1/contacts/${cid}/methods`, { headers: auth(h.token) });
    expect(JSON.parse(mlist.body).data.length).toBe(1);

    const mdel = await raw(h.app, 'DELETE', `/api/v1/contacts/${cid}/methods/${methodId}`, { headers: auth(h.token) });
    expect(mdel.status).toBe(200);

    const t = await raw(h.app, 'POST', `/api/v1/contacts/${cid}/tags`, { headers: auth(h.token), body: { name: 'vip' } });
    expect(t.status).toBe(201);
    const tagId = JSON.parse(t.body).data.id;
    const tlist = await raw(h.app, 'GET', `/api/v1/contacts/${cid}/tags`, { headers: auth(h.token) });
    expect(JSON.parse(tlist.body).data.some((x: { id: string }) => x.id === tagId)).toBe(true);
    const tdel = await raw(h.app, 'DELETE', `/api/v1/contacts/${cid}/tags/${tagId}`, { headers: auth(h.token) });
    expect(tdel.status).toBe(200);
  });

  // ─── Other entities ────────────────────────────────────────

  it('creates and lists notes for a contact', async () => {
    h = await makeHarness();
    const cid = h.selfContactId;
    const create = await raw(h.app, 'POST', '/api/v1/notes', { headers: auth(h.token), body: { contact_id: cid, body: 'Hello note' } });
    expect(create.status).toBe(201);
    const list = await raw(h.app, 'GET', `/api/v1/notes?contact_id=${cid}`, { headers: auth(h.token) });
    expect(list.status).toBe(200);
    expect(JSON.parse(list.body).data.length).toBe(1);
  });

  it('CRUDs a task incl. complete', async () => {
    h = await makeHarness();
    const create = await raw(h.app, 'POST', '/api/v1/tasks', { headers: auth(h.token), body: { title: 'Do thing' } });
    expect(create.status).toBe(201);
    const id = JSON.parse(create.body).data.id;
    const complete = await raw(h.app, 'POST', `/api/v1/tasks/${id}/complete`, { headers: auth(h.token) });
    expect(complete.status).toBe(200);
    expect(JSON.parse(complete.body).data.status).toBe('completed');
  });

  it('searches across entities', async () => {
    h = await makeHarness();
    await raw(h.app, 'POST', '/api/v1/contacts', { headers: auth(h.token), body: { first_name: 'Zaphod' } });
    const res = await raw(h.app, 'GET', '/api/v1/search?query=Zaphod', { headers: auth(h.token) });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.total_matches).toBeGreaterThanOrEqual(1);
    expect(body.data.contacts.some((x: { title: string }) => x.title.includes('Zaphod'))).toBe(true);
  });

  it('exports all data', async () => {
    h = await makeHarness();
    const res = await raw(h.app, 'GET', '/api/v1/export', { headers: auth(h.token) });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body).data;
    expect(data).toHaveProperty('contacts');
    expect(data).toHaveProperty('version');
  });

  // ─── Rate limiting ─────────────────────────────────────────

  it('returns 429 with Retry-After when the rate limit trips', async () => {
    h = await makeHarness({ routerOverrides: { rateLimitMax: 2, rateLimitWindowMs: 60_000 } });
    const ok1 = await raw(h.app, 'GET', '/api/v1/me', { headers: auth(h.token) });
    const ok2 = await raw(h.app, 'GET', '/api/v1/me', { headers: auth(h.token) });
    expect(ok1.status).toBe(200);
    expect(ok2.status).toBe(200);
    const tripped = await raw(h.app, 'GET', '/api/v1/me', { headers: auth(h.token) });
    expect(tripped.status).toBe(429);
    expect(JSON.parse(tripped.body).error.code).toBe('rate_limited');
    expect(tripped.headers['retry-after']).toBeDefined();
  });

  // ─── Plan gating ───────────────────────────────────────────

  it('self-hosted: public API is open regardless of plan', async () => {
    h = await makeHarness({ cfg: persistent, plan: 'free' }); // hosted=false → unlimited
    const res = await raw(h.app, 'GET', '/api/v1/contacts', { headers: auth(h.token) });
    expect(res.status).toBe(200);
  });

  it('hosted free: public API is open during beta', async () => {
    h = await makeHarness({ cfg: hostedCfg, plan: 'free' });
    const res = await raw(h.app, 'GET', '/api/v1/contacts', { headers: auth(h.token) });
    expect(res.status).toBe(200);
  });

  it('hosted paid: public API is open', async () => {
    h = await makeHarness({ cfg: hostedCfg, plan: 'paid' });
    const res = await raw(h.app, 'GET', '/api/v1/contacts', { headers: auth(h.token) });
    expect(res.status).toBe(200);
  });

  it('hosted paid: contact create works (quota is a no-op for unlimited plans)', async () => {
    h = await makeHarness({ cfg: hostedCfg, plan: 'paid' });
    // Paid plan has unlimited contacts; just verify create works (quota no-op).
    const res = await raw(h.app, 'POST', '/api/v1/contacts', { headers: auth(h.token), body: { first_name: 'Paid' } });
    expect(res.status).toBe(201);
  });
});
