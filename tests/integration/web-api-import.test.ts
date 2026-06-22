import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import express, { type Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';
import { ContactService } from '../../src/services/contacts.js';
import { PlanService } from '../../src/services/plans.js';
import { createImportRouter } from '../../src/server/web-api/import.js';
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

const VCARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Muffin Heeler',
  'N:Heeler;Muffin;;;',
  'EMAIL;TYPE=HOME:muffin@example.com',
  'TEL;TYPE=CELL:+1 555-111-2222',
  'END:VCARD',
].join('\n');

const CSV = [
  'Name,Given Name,Family Name,Organization Name,E-mail 1 - Type,E-mail 1 - Value',
  'Socks Heeler,Socks,Heeler,Heeler Family,Home,socks@example.com',
].join('\n');

async function setup(): Promise<{ srv: ReturnType<typeof createServer>; app: Express; userId: string }> {
  const srv = createServer({ port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' });
  const accounts = new AccountService(srv.db);
  const acct = await accounts.createAccount({ name: 'Import User', email: 'import@test.dev', password: 'password123', plan: 'unlimited' });
  const userId = (acct as { id: string }).id;
  const planService = new PlanService(srv.db, false);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).webUser = { userId }; next(); });
  app.use('/import', createImportRouter(srv.db, planService));
  app.use(apiErrorHandler);
  return { srv, app, userId };
}

describe('Import internal API (/import)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('imports contacts from a vCard', async () => {
    const { srv, app, userId } = await setup();
    server = srv;
    const before = new ContactService(srv.db).list(userId, {}).total;
    const res = await raw(app, 'POST', '/import/vcard', { text: VCARD });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).data.created).toBe(1);
    expect(new ContactService(srv.db).list(userId, {}).total).toBe(before + 1);
  });

  it('imports contacts from a Google CSV', async () => {
    const { srv, app, userId } = await setup();
    server = srv;
    const before = new ContactService(srv.db).list(userId, {}).total;
    const res = await raw(app, 'POST', '/import/google-csv', { text: CSV });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).data.created).toBe(1);
    expect(new ContactService(srv.db).list(userId, {}).total).toBe(before + 1);
  });

  it('dedups a re-imported vCard', async () => {
    const { srv, app } = await setup();
    server = srv;
    await raw(app, 'POST', '/import/vcard', { text: VCARD });
    const second = await raw(app, 'POST', '/import/vcard', { text: VCARD });
    const summary = JSON.parse(second.body).data;
    expect(summary.created).toBe(0);
    expect(summary.skipped_duplicate).toBe(1);
  });

  it('preview parses without importing', async () => {
    const { srv, app, userId } = await setup();
    server = srv;
    const res = await raw(app, 'POST', '/import/preview/vcard', { text: VCARD });
    expect(res.status).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(data.count).toBe(1);
    expect(data.records[0].first_name).toBe('Muffin');
    // Nothing extra was persisted by a preview.
    expect(new ContactService(srv.db).list(userId, {}).data.some((c: any) => c.first_name === 'Muffin')).toBe(false);
  });

  it('422 when text is missing', async () => {
    const { srv, app } = await setup();
    server = srv;
    const res = await raw(app, 'POST', '/import/vcard', {});
    expect(res.status).toBe(422);
  });
});
