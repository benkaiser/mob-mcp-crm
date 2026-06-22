import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import express, { type Express, type RequestHandler } from 'express';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';
import { ContactService } from '../../src/services/contacts.js';
import { apiErrorHandler } from '../../src/server/web-api/helpers.js';
import { createContactMethodsRouter } from '../../src/server/web-api/contact-methods.js';
import { createContactAddressesRouter } from '../../src/server/web-api/contact-addresses.js';
import { createContactCustomFieldsRouter } from '../../src/server/web-api/contact-custom-fields.js';
import { createContactFoodPreferencesRouter } from '../../src/server/web-api/contact-food-preferences.js';
import { createContactRelationshipsRouter } from '../../src/server/web-api/contact-relationships.js';
import { createContactTagsRouter } from '../../src/server/web-api/contact-tags.js';

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

const persistent: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' };

/**
 * Build a minimal express app that mounts the sub-entity routers at /contacts
 * with a fake session middleware setting webUser.userId. This lets us exercise
 * the routers without depending on index.ts wiring them.
 */
function makeApp(srv: ReturnType<typeof createServer>, userId: string): Express {
  const app = express();
  app.use(express.json());
  const fakeSession: RequestHandler = (req, _res, next) => {
    (req as { webUser?: unknown }).webUser = { userId, userName: 'Test', email: 'auth@test.dev' };
    next();
  };
  app.use(fakeSession);
  app.use('/contacts', createContactMethodsRouter(srv.db));
  app.use('/contacts', createContactAddressesRouter(srv.db));
  app.use('/contacts', createContactCustomFieldsRouter(srv.db));
  app.use('/contacts', createContactFoodPreferencesRouter(srv.db));
  app.use('/contacts', createContactRelationshipsRouter(srv.db));
  app.use('/contacts', createContactTagsRouter(srv.db));
  app.use(apiErrorHandler);
  return app;
}

async function setup(): Promise<{ app: Express; userId: string; contactId: string; otherContactId: string }> {
  const srv = createServer(persistent);
  const accounts = new AccountService(srv.db);
  const user = await accounts.createAccount({ name: 'Test User', email: 'auth@test.dev', password: 'password123', plan: 'unlimited' });
  const contacts = new ContactService(srv.db);
  const contact = contacts.create(user.id, { first_name: 'Chilli' });
  const other = contacts.create(user.id, { first_name: 'Bingo' });
  return { app: makeApp(srv, user.id), userId: user.id, contactId: contact.id, otherContactId: other.id };
}

const data = (res: Res) => JSON.parse(res.body).data;

describe('Contact sub-entities internal API (/contacts)', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => { if (cleanup) { cleanup(); cleanup = null; } });

  it('CRUDs contact methods + 404 ownership + 422 validation', async () => {
    const { app, contactId } = await setup();

    const create = await raw(app, 'POST', `/contacts/${contactId}/methods`, { body: { type: 'email', value: 'a@b.com' } });
    expect(create.status).toBe(201);
    const methodId = data(create).id;
    expect(data(create).value).toBe('a@b.com');

    const list = await raw(app, 'GET', `/contacts/${contactId}/methods`);
    expect(list.status).toBe(200);
    expect(data(list).length).toBe(1);

    const upd = await raw(app, 'PATCH', `/contacts/${contactId}/methods/${methodId}`, { body: { value: 'c@d.com' } });
    expect(upd.status).toBe(200);
    expect(data(upd).value).toBe('c@d.com');

    const del = await raw(app, 'DELETE', `/contacts/${contactId}/methods/${methodId}`);
    expect(del.status).toBe(200);
    expect(data(del).deleted).toBe(true);

    // 404 for missing item update
    const missing = await raw(app, 'PATCH', `/contacts/${contactId}/methods/nope`, { body: { value: 'x' } });
    expect(missing.status).toBe(404);

    // 422 validation (invalid type)
    const bad = await raw(app, 'POST', `/contacts/${contactId}/methods`, { body: { type: 'bogus', value: 'x' } });
    expect(bad.status).toBe(422);
    expect(JSON.parse(bad.body).error.code).toBe('validation_error');
  });

  it('returns 404 when the contact is not owned by the user', async () => {
    const { app } = await setup();
    const res = await raw(app, 'GET', '/contacts/not-mine/methods');
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('not_found');
  });

  it('does not mutate child records from another user when child IDs are known', async () => {
    const srv = createServer(persistent);
    cleanup = () => srv.stop();
    const accounts = new AccountService(srv.db);
    const attacker = await accounts.createAccount({ name: 'Attacker', email: 'attacker@test.dev', password: 'password123' });
    const victim = await accounts.createAccount({ name: 'Victim', email: 'victim@test.dev', password: 'password123' });
    const contacts = new ContactService(srv.db);
    const attackerContact = contacts.create(attacker.id, { first_name: 'Attacker Contact' });
    const victimContact = contacts.create(victim.id, { first_name: 'Victim Contact' });

    const methodId = (srv.db.prepare(`
      INSERT INTO contact_methods (id, contact_id, type, value)
      VALUES ('victim-method', ?, 'email', 'victim@example.com')
      RETURNING id
    `).get(victimContact.id) as { id: string }).id;
    const addressId = (srv.db.prepare(`
      INSERT INTO addresses (id, contact_id, city)
      VALUES ('victim-address', ?, 'Brisbane')
      RETURNING id
    `).get(victimContact.id) as { id: string }).id;
    const fieldId = (srv.db.prepare(`
      INSERT INTO custom_fields (id, contact_id, field_name, field_value)
      VALUES ('victim-field', ?, 'Secret', 'Value')
      RETURNING id
    `).get(victimContact.id) as { id: string }).id;

    const app = makeApp(srv, attacker.id);

    expect((await raw(app, 'PATCH', `/contacts/${attackerContact.id}/methods/${methodId}`, { body: { value: 'owned@example.com' } })).status).toBe(404);
    expect((await raw(app, 'DELETE', `/contacts/${attackerContact.id}/addresses/${addressId}`)).status).toBe(404);
    expect((await raw(app, 'PATCH', `/contacts/${attackerContact.id}/custom-fields/${fieldId}`, { body: { field_value: 'owned' } })).status).toBe(404);

    expect((srv.db.prepare('SELECT value FROM contact_methods WHERE id = ?').get(methodId) as { value: string }).value).toBe('victim@example.com');
    expect((srv.db.prepare('SELECT city FROM addresses WHERE id = ?').get(addressId) as { city: string }).city).toBe('Brisbane');
    expect((srv.db.prepare('SELECT field_value FROM custom_fields WHERE id = ?').get(fieldId) as { field_value: string }).field_value).toBe('Value');
  });

  it('CRUDs addresses', async () => {
    const { app, contactId } = await setup();
    const create = await raw(app, 'POST', `/contacts/${contactId}/addresses`, { body: { label: 'Home', city: 'Brisbane' } });
    expect(create.status).toBe(201);
    const id = data(create).id;
    const list = await raw(app, 'GET', `/contacts/${contactId}/addresses`);
    expect(data(list).length).toBe(1);
    const upd = await raw(app, 'PATCH', `/contacts/${contactId}/addresses/${id}`, { body: { city: 'Sydney' } });
    expect(data(upd).city).toBe('Sydney');
    const del = await raw(app, 'DELETE', `/contacts/${contactId}/addresses/${id}`);
    expect(data(del).deleted).toBe(true);
  });

  it('CRUDs custom fields', async () => {
    const { app, contactId } = await setup();
    const create = await raw(app, 'POST', `/contacts/${contactId}/custom-fields`, { body: { field_name: 'Shoe size', field_value: '42' } });
    expect(create.status).toBe(201);
    const id = data(create).id;
    const list = await raw(app, 'GET', `/contacts/${contactId}/custom-fields`);
    expect(data(list).length).toBe(1);
    const upd = await raw(app, 'PATCH', `/contacts/${contactId}/custom-fields/${id}`, { body: { field_value: '43' } });
    expect(data(upd).field_value).toBe('43');
    const del = await raw(app, 'DELETE', `/contacts/${contactId}/custom-fields/${id}`);
    expect(data(del).deleted).toBe(true);
  });

  it('gets + upserts food preferences', async () => {
    const { app, contactId } = await setup();
    const initial = await raw(app, 'GET', `/contacts/${contactId}/food-preferences`);
    expect(initial.status).toBe(200);
    expect(data(initial)).toBeNull();

    const put = await raw(app, 'PUT', `/contacts/${contactId}/food-preferences`, { body: { allergies: ['peanuts'], notes: 'careful' } });
    expect(put.status).toBe(200);
    expect(data(put).allergies).toEqual(['peanuts']);

    const patch = await raw(app, 'PATCH', `/contacts/${contactId}/food-preferences`, { body: { favorite_foods: ['pizza'] } });
    expect(patch.status).toBe(200);
    expect(data(patch).favorite_foods).toEqual(['pizza']);

    const get = await raw(app, 'GET', `/contacts/${contactId}/food-preferences`);
    expect(data(get).favorite_foods).toEqual(['pizza']);
  });

  it('CRUDs relationships', async () => {
    const { app, contactId, otherContactId } = await setup();
    const create = await raw(app, 'POST', `/contacts/${contactId}/relationships`, { body: { related_contact_id: otherContactId, relationship_type: 'parent' } });
    expect(create.status).toBe(201);
    const id = data(create).id;
    const list = await raw(app, 'GET', `/contacts/${contactId}/relationships`);
    expect(data(list).length).toBe(1);
    expect(data(list)[0]).toHaveProperty('related_contact_name');
    const upd = await raw(app, 'PATCH', `/contacts/${contactId}/relationships/${id}`, { body: { notes: 'close' } });
    expect(data(upd).notes).toBe('close');
    const del = await raw(app, 'DELETE', `/contacts/${contactId}/relationships/${id}`);
    expect(data(del).deleted).toBe(true);
  });

  it('assigns + lists + removes tags', async () => {
    const { app, contactId } = await setup();
    const create = await raw(app, 'POST', `/contacts/${contactId}/tags`, { body: { name: 'family', color: '#ff0000' } });
    expect(create.status).toBe(201);
    const tagId = data(create).id;
    const list = await raw(app, 'GET', `/contacts/${contactId}/tags`);
    expect(data(list).some((t: { name: string }) => t.name === 'family')).toBe(true);
    const del = await raw(app, 'DELETE', `/contacts/${contactId}/tags/${tagId}`);
    expect(data(del).deleted).toBe(true);
    const after = await raw(app, 'GET', `/contacts/${contactId}/tags`);
    expect(data(after).length).toBe(0);
  });
});
