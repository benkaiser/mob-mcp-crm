import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type Database from 'better-sqlite3';
import { createWebApiRouter } from '../../src/server/web-api/index.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

interface InjectedResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function inject(
  app: express.Express,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<InjectedResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const req = http.request({
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      }, (res) => {
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

function cookieFrom(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers['set-cookie'] ?? [];
  for (const c of raw) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return undefined;
}

function appFor(db: Database.Database, userId: string, forgetful = false): express.Express {
  const app = express();
  const planService = {
    getUsage: () => ({ plan: 'unlimited', contacts: 0, contactCap: null }),
    getEntitlements: () => ({ contactCap: null, publicApi: true, webhooks: true, advancedImport: true }),
    isHosted: () => false,
    requireFeature: () => undefined,
  };
  app.use('/web/api', createWebApiRouter({
    db,
    planService: planService as any,
    getWebSession: (token) => token === 'session' ? { userId, userName: 'Test User', email: 'test@example.com' } : null,
    parseCookie: (header, name) => {
      const match = (header ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : null;
    },
    cookieSecure: false,
    accountService: {} as any,
    sessionService: {} as any,
    oauthService: {} as any,
    settingsService: { get: () => ({ timezone: 'UTC' }) } as any,
    emailService: {} as any,
    baseUrl: 'http://localhost',
    forgetful,
  }));
  return app;
}

describe('relationship type web-api', () => {
  let db: Database.Database | null = null;
  afterEach(() => { if (db) { closeDatabase(db); db = null; } });

  async function csrf(app: express.Express): Promise<string> {
    const res = await inject(app, 'GET', '/web/api/relationship-types', {
      headers: { Cookie: 'mob_session=session' },
    });
    const token = cookieFrom(res.headers, 'mob_csrf');
    if (!token) throw new Error('missing csrf cookie');
    return token;
  }

  it('creates custom types and returns merged relationship types', async () => {
    db = createTestDatabase();
    const userId = createTestUser(db);
    const app = appFor(db, userId);
    const token = await csrf(app);

    const created = await inject(app, 'POST', '/web/api/relationship-types/custom', {
      headers: { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token },
      body: { value: 'ignored_by_server', label: 'Board mentor', inverse_value: 'Board Mentee' },
    });
    expect(created.status).toBe(201);
    const createdType = JSON.parse(created.body).data;
    expect(createdType.value).toBe('board_mentor');

    const custom = await inject(app, 'GET', '/web/api/relationship-types/custom', {
      headers: { Cookie: 'mob_session=session' },
    });
    expect(custom.status).toBe(200);
    expect(JSON.parse(custom.body).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'board_mentor' }),
    ]));

    const list = await inject(app, 'GET', '/web/api/relationship-types', {
      headers: { Cookie: 'mob_session=session' },
    });
    expect(list.status).toBe(200);
    expect(JSON.parse(list.body).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'spouse', source: 'canonical' }),
      expect.objectContaining({ value: 'board_mentor', inverse_value: 'board_mentee' }),
      expect.objectContaining({ value: 'board_mentee', inverse_value: 'board_mentor' }),
    ]));

    const updated = await inject(app, 'PATCH', `/web/api/relationship-types/custom/${createdType.id}`, {
      headers: { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token },
      body: { label: 'Advisory mentor' },
    });
    expect(updated.status).toBe(200);
    expect(JSON.parse(updated.body).data).toEqual(expect.objectContaining({ label: 'Advisory mentor', value: 'advisory_mentor', inverse_value: 'advisory_mentor' }));

    const deleted = await inject(app, 'DELETE', `/web/api/relationship-types/custom/${createdType.id}`, {
      headers: { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token },
    });
    expect(deleted.status).toBe(200);
    expect(JSON.parse(deleted.body).data.deleted).toBe(true);

    const missing = await inject(app, 'DELETE', `/web/api/relationship-types/custom/${createdType.id}`, {
      headers: { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token },
    });
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body).error.code).toBe('not_found');
  });

  it('rejects duplicate custom types', async () => {
    db = createTestDatabase();
    const userId = createTestUser(db);
    const app = appFor(db, userId);
    const token = await csrf(app);
    const headers = { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token };

    await inject(app, 'POST', '/web/api/relationship-types/custom', {
      headers,
      body: { label: 'Coach', inverse_value: 'Player' },
    });
    const duplicate = await inject(app, 'POST', '/web/api/relationship-types/custom', {
      headers,
      body: { label: 'coach!!!', inverse_value: 'Player' },
    });

    expect(duplicate.status).toBe(400);
    const error = JSON.parse(duplicate.body).error;
    expect(error.code).toBe('invalid_relationship_type');
    expect(error.message).toContain('similar name');
  });

  it('defaults blank inverse values and rejects invalid labels', async () => {
    db = createTestDatabase();
    const userId = createTestUser(db);
    const app = appFor(db, userId);
    const token = await csrf(app);
    const headers = { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token };

    const created = await inject(app, 'POST', '/web/api/relationship-types/custom', {
      headers,
      body: { label: 'Accountability Buddy', inverse_value: '   ' },
    });
    expect(created.status).toBe(201);
    expect(JSON.parse(created.body).data).toEqual(expect.objectContaining({
      value: 'accountability_buddy',
      label: 'Accountability Buddy',
      inverse_value: 'accountability_buddy',
    }));

    const invalid = await inject(app, 'POST', '/web/api/relationship-types/custom', {
      headers,
      body: { label: '!!!' },
    });
    expect(invalid.status).toBe(400);
    expect(JSON.parse(invalid.body).error.code).toBe('invalid_relationship_type');
  });

  it('returns canonical types but blocks custom management in forgetful mode', async () => {
    db = createTestDatabase();
    const userId = createTestUser(db);
    const app = appFor(db, userId, true);
    const token = await csrf(app);

    const merged = await inject(app, 'GET', '/web/api/relationship-types', {
      headers: { Cookie: 'mob_session=session' },
    });
    expect(merged.status).toBe(200);
    expect(JSON.parse(merged.body).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'parent', source: 'canonical' }),
    ]));

    const custom = await inject(app, 'POST', '/web/api/relationship-types/custom', {
      headers: { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token },
      body: { label: 'Coach', inverse_value: 'Player' },
    });
    expect(custom.status).toBe(400);
    expect(JSON.parse(custom.body).error.code).toBe('unavailable');
  });
});
