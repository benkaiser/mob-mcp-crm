import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import express, { type Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';
import { ContactService } from '../../src/services/contacts.js';
import { createDashboardRouter } from '../../src/server/web-api/dashboard.js';
import { createSearchRouter } from '../../src/server/web-api/search.js';
import { createExportRouter } from '../../src/server/web-api/export.js';
import { apiErrorHandler } from '../../src/server/web-api/helpers.js';

interface Res { status: number; body: string }

function raw(app: Express, method: string, path: string, body?: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('bad addr')); return; }
      const headers: Record<string, string> = {};
      let payload: string | undefined;
      if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
      const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method, headers }, (r) => {
        let data = '';
        r.on('data', (c: Buffer) => { data += c.toString(); });
        r.on('end', () => { server.close(); resolve({ status: r.statusCode ?? 0, body: data }); });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

/** Build a minimal express app with a fake session + the routers under test. */
function buildApp(srv: ReturnType<typeof createServer>, userId: string): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).webUser = { userId }; next(); });
  app.use('/dashboard', createDashboardRouter(srv.db));
  app.use('/search', createSearchRouter(srv.db));
  app.use('/export', createExportRouter(srv.db));
  app.use(apiErrorHandler);
  return app;
}

async function setup(): Promise<{ srv: ReturnType<typeof createServer>; userId: string }> {
  const srv = createServer({ port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' });
  const accounts = new AccountService(srv.db);
  const acct = await accounts.createAccount({ name: 'Dash User', email: 'dash@test.dev', password: 'password123', plan: 'unlimited' });
  return { srv, userId: (acct as any).id ?? (acct as any).userId };
}

describe('Dashboard / Search / Export internal API', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('dashboard returns the composed shape', async () => {
    const { srv, userId } = await setup();
    server = srv;
    const contacts = new ContactService(srv.db);
    const before = contacts.list(userId, {}).total;
    contacts.create(userId, { first_name: 'Bluey', last_name: 'Heeler' });
    const app = buildApp(srv, userId);

    const res = await raw(app, 'GET', '/dashboard');
    expect(res.status).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(data).toHaveProperty('upcoming_reminders');
    expect(data).toHaveProperty('upcoming_birthdays');
    expect(data).toHaveProperty('recent_activities');
    expect(data).toHaveProperty('open_tasks');
    expect(data).toHaveProperty('debt_summary');
    expect(data.debt_summary).toHaveProperty('by_currency');
    expect(data.counts.contacts).toBe(before + 1);
  });

  it('search returns a seeded contact and 422 when q missing', async () => {
    const { srv, userId } = await setup();
    server = srv;
    new ContactService(srv.db).create(userId, { first_name: 'Bandit', last_name: 'Heeler' });
    const app = buildApp(srv, userId);

    const res = await raw(app, 'GET', '/search?q=Bandit');
    expect(res.status).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(data.total_matches).toBeGreaterThan(0);
    expect(data.results.contacts.length).toBe(1);
    expect(data.results.contacts[0].title).toContain('Bandit');

    const missing = await raw(app, 'GET', '/search');
    expect(missing.status).toBe(422);
  });

  it('export returns data + statistics', async () => {
    const { srv, userId } = await setup();
    server = srv;
    const contacts = new ContactService(srv.db);
    const before = contacts.list(userId, {}).total;
    contacts.create(userId, { first_name: 'Chilli', last_name: 'Heeler' });
    const app = buildApp(srv, userId);

    const dump = await raw(app, 'GET', '/export');
    expect(dump.status).toBe(200);
    const { data } = JSON.parse(dump.body);
    expect(data.version).toBe('1.0');
    expect(data.contacts.length).toBe(before + 1);

    const stats = await raw(app, 'GET', '/export/statistics');
    expect(stats.status).toBe(200);
    expect(JSON.parse(stats.body).data.total_contacts).toBe(before + 1);
  });
});
