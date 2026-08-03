import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type Database from 'better-sqlite3';
import { createWebApiRouter } from '../../src/server/web-api/index.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

interface InjectedResponse { status: number; body: string; headers: http.IncomingHttpHeaders }

function inject(app: express.Express, method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<InjectedResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const req = http.request({
        hostname: '127.0.0.1', port: addr.port, path, method,
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      }, (res) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => { server.close(); resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers }); });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (opts.body !== undefined) req.write(JSON.stringify(opts.body));
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

describe('contact method type web-api', () => {
  let db: Database.Database | null = null;
  afterEach(() => { if (db) { closeDatabase(db); db = null; } });

  async function csrf(app: express.Express): Promise<string> {
    const res = await inject(app, 'GET', '/web/api/contact-method-types', { headers: { Cookie: 'mob_session=session' } });
    const token = cookieFrom(res.headers, 'mob_csrf');
    if (!token) throw new Error('missing csrf cookie');
    return token;
  }

  it('returns built-ins, creates overrides and custom types, and deletes them', async () => {
    db = createTestDatabase();
    const userId = createTestUser(db);
    const app = appFor(db, userId);
    const token = await csrf(app);
    const headers = { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token };

    const initial = await inject(app, 'GET', '/web/api/contact-method-types', { headers: { Cookie: 'mob_session=session' } });
    expect(initial.status).toBe(200);
    expect(JSON.parse(initial.body).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'phone', link_template: 'tel:{value}', source: 'built-in' }),
    ]));

    const override = await inject(app, 'POST', '/web/api/contact-method-types', {
      headers,
      body: { key: 'phone', label: 'Phone', link_template: 'sms:{value}' },
    });
    expect(override.status).toBe(201);
    expect(JSON.parse(override.body).data).toEqual(expect.objectContaining({ key: 'phone', link_template: 'sms:{value}' }));

    const custom = await inject(app, 'POST', '/web/api/contact-method-types', {
      headers,
      body: { key: 'mastodon', label: 'Mastodon', link_template: 'https://social.example/@{value}' },
    });
    expect(custom.status).toBe(201);

    const merged = await inject(app, 'GET', '/web/api/contact-method-types', { headers: { Cookie: 'mob_session=session' } });
    expect(JSON.parse(merged.body).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'phone', source: 'override', link_template: 'sms:{value}' }),
      expect.objectContaining({ key: 'mastodon', source: 'custom' }),
    ]));

    const patched = await inject(app, 'PATCH', '/web/api/contact-method-types/mastodon', {
      headers,
      body: { label: 'Fediverse', link_template: 'https://fed.example/{value}' },
    });
    expect(patched.status).toBe(200);
    expect(JSON.parse(patched.body).data).toEqual(expect.objectContaining({ label: 'Fediverse' }));

    const reset = await inject(app, 'DELETE', '/web/api/contact-method-types/phone', { headers });
    expect(reset.status).toBe(200);
    const deleted = await inject(app, 'DELETE', '/web/api/contact-method-types/mastodon', { headers });
    expect(deleted.status).toBe(200);

    const missing = await inject(app, 'DELETE', '/web/api/contact-method-types/mastodon', { headers });
    expect(missing.status).toBe(404);
  });

  it('rejects invalid keys and blocks management in forgetful mode while returning built-ins', async () => {
    db = createTestDatabase();
    const userId = createTestUser(db);
    const app = appFor(db, userId, true);
    const token = await csrf(app);

    const merged = await inject(app, 'GET', '/web/api/contact-method-types', { headers: { Cookie: 'mob_session=session' } });
    expect(merged.status).toBe(200);
    expect(JSON.parse(merged.body).data).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'email', source: 'built-in' }),
    ]));

    const custom = await inject(app, 'POST', '/web/api/contact-method-types', {
      headers: { Cookie: `mob_session=session; mob_csrf=${token}`, 'X-CSRF-Token': token },
      body: { key: 'mastodon', label: 'Mastodon' },
    });
    expect(custom.status).toBe(400);
    expect(JSON.parse(custom.body).error.code).toBe('unavailable');

    const persistentApp = appFor(db, userId);
    const persistentToken = await csrf(persistentApp);
    const invalid = await inject(persistentApp, 'POST', '/web/api/contact-method-types', {
      headers: { Cookie: `mob_session=session; mob_csrf=${persistentToken}`, 'X-CSRF-Token': persistentToken },
      body: { key: '!!!', label: 'Nope' },
    });
    expect(invalid.status).toBe(400);
    expect(JSON.parse(invalid.body).error.code).toBe('invalid_contact_method_type');
  });
});
