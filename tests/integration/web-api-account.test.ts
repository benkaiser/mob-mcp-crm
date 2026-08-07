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
      if (payload !== undefined) headers['Content-Length'] = String(Buffer.byteLength(payload));
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

async function login(app: Express, email: string, password: string): Promise<string> {
  const res = await raw(app, 'POST', '/web/login', { form: { email, password } });
  const session = cookieFrom(res.headers, 'mob_session');
  if (!session) throw new Error('login failed');
  return session;
}

async function makeClient(srv: ReturnType<typeof createServer>, email = 'acct@test.dev'): Promise<Client> {
  const accounts = new AccountService(srv.db);
  await accounts.createAccount({ name: 'Acct User', email, password: 'password123' });
  const session = await login(srv.app, email, 'password123');
  const me = await raw(srv.app, 'GET', '/web/api/me', { headers: { Cookie: `mob_session=${session}` } });
  const csrf = cookieFrom(me.headers, 'mob_csrf');
  if (!csrf) throw new Error('no csrf');
  return new Client(srv.app, session, csrf);
}

describe('Account self-service API (/web/api/account)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('changes password with a correct current password and rejects a wrong one', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);

    const bad = await c.mutate('POST', '/web/api/account/password', { current_password: 'wrong', new_password: 'newpassword456' });
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.body).error.code).toBe('invalid_password');

    const ok = await c.mutate('POST', '/web/api/account/password', { current_password: 'password123', new_password: 'newpassword456' });
    expect(ok.status).toBe(200);
    // Old password no longer works.
    const relogin = await raw(server.app, 'POST', '/web/login', { form: { email: 'acct@test.dev', password: 'newpassword456' } });
    expect(cookieFrom(relogin.headers, 'mob_session')).toBeDefined();
  });

  it('changing password also revokes OAuth access tokens and API tokens', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const userId = (server.db.prepare('SELECT id FROM users WHERE email = ?').get('acct@test.dev') as { id: string }).id;

    server.db.prepare('INSERT INTO oauth_tokens (access_token, user_id, client_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run('oauth-tok-1', userId, 'claude-desktop', Date.now(), Date.now() + 1000000);
    server.db.prepare(`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, scopes) VALUES ('tok-id-1', ?, 'CI token', 'hash1', 'prefix1', 'read,write')`)
      .run(userId);

    const ok = await c.mutate('POST', '/web/api/account/password', { current_password: 'password123', new_password: 'newpassword456' });
    expect(ok.status).toBe(200);

    expect(server.db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens WHERE user_id = ?').get(userId)).toEqual({ n: 0 });
    const apiToken = server.db.prepare('SELECT revoked_at FROM api_tokens WHERE id = ?').get('tok-id-1') as { revoked_at: string | null };
    expect(apiToken.revoked_at).not.toBeNull();
  });

  it('rejects a too-short new password with 422', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.mutate('POST', '/web/api/account/password', { current_password: 'password123', new_password: 'short' });
    expect(res.status).toBe(422);
  });

  it('updates name and timezone immediately', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.mutate('PATCH', '/web/api/account/profile', { name: 'Renamed', timezone: 'Australia/Sydney' });
    expect(res.status).toBe(200);
    const me = JSON.parse((await c.get('/web/api/me')).body).data;
    expect(me.name).toBe('Renamed');
    expect(me.timezone).toBe('Australia/Sydney');
  });

  it('rejects an invalid timezone with 422', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.mutate('PATCH', '/web/api/account/profile', { timezone: 'Not/AZone' });
    expect(res.status).toBe(422);
  });

  it('email change requires re-authentication and notifies the old address', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);

    const noPassword = await c.mutate('PATCH', '/web/api/account/profile', { email: 'newmail@test.dev' });
    expect(noPassword.status).toBe(422);

    const wrongPassword = await c.mutate('PATCH', '/web/api/account/profile', { email: 'newmail@test.dev', current_password: 'wrong' });
    expect(wrongPassword.status).toBe(400);
    expect(JSON.parse(wrongPassword.body).error.code).toBe('invalid_password');

    // Email is untouched by the failed attempts.
    const meBefore = JSON.parse((await c.get('/web/api/me')).body).data;
    expect(meBefore.pending_email).toBeNull();
  });

  it('email change goes through verification (pending until confirmed)', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const res = await c.mutate('PATCH', '/web/api/account/profile', { email: 'newmail@test.dev', current_password: 'password123' });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).data.email_change_pending).toBe(true);
    const me = JSON.parse((await c.get('/web/api/me')).body).data;
    // Email not changed yet, but pending + unverified surfaced.
    expect(me.email).toBe('acct@test.dev');
    expect(me.pending_email).toBe('newmail@test.dev');
  });

  it('lists and revokes connected AI assistants (OAuth clients)', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    const userId = (server.db.prepare('SELECT id FROM users WHERE email = ?').get('acct@test.dev') as { id: string }).id;
    server.db.prepare('INSERT INTO oauth_tokens (access_token, user_id, client_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run('tok1', userId, 'claude-desktop', Date.now(), Date.now() + 1000000);

    const list = JSON.parse((await c.get('/web/api/account/connections')).body).data;
    expect(list).toHaveLength(1);
    expect(list[0].client_id).toBe('claude-desktop');

    const del = await c.mutate('DELETE', '/web/api/account/connections/claude-desktop');
    expect(del.status).toBe(200);
    expect(JSON.parse((await c.get('/web/api/account/connections')).body).data).toHaveLength(0);
  });

  it('lists sessions (marking the current one) and revokes others', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);
    // Create a second session for the same user.
    await login(server.app, 'acct@test.dev', 'password123');

    const sessions = JSON.parse((await c.get('/web/api/account/sessions')).body).data;
    expect(sessions.length).toBe(2);
    expect(sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const revokeAll = await c.mutate('POST', '/web/api/account/sessions/revoke-all');
    expect(revokeAll.status).toBe(200);
    expect(JSON.parse(revokeAll.body).data.revoked).toBe(1);
    // Only the current session remains.
    expect(JSON.parse((await c.get('/web/api/account/sessions')).body).data).toHaveLength(1);
  });

  it('hard-deletes the account only with correct password + email confirmation', async () => {
    server = createServer(persistent);
    const c = await makeClient(server);

    const wrongEmail = await c.mutate('DELETE', '/web/api/account', { password: 'password123', confirm_email: 'nope@test.dev' });
    expect(wrongEmail.status).toBe(400);
    expect(JSON.parse(wrongEmail.body).error.code).toBe('confirm_mismatch');

    const wrongPw = await c.mutate('DELETE', '/web/api/account', { password: 'wrong', confirm_email: 'acct@test.dev' });
    expect(wrongPw.status).toBe(400);
    expect(JSON.parse(wrongPw.body).error.code).toBe('invalid_password');

    const ok = await c.mutate('DELETE', '/web/api/account', { password: 'password123', confirm_email: 'acct@test.dev' });
    expect(ok.status).toBe(200);
    expect(server.db.prepare('SELECT id FROM users WHERE email = ?').get('acct@test.dev')).toBeUndefined();
  });
});

describe('Password reset & verification pages', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('forgot responds generically for unknown and known emails', async () => {
    server = createServer(persistent);
    const accounts = new AccountService(server.db);
    await accounts.createAccount({ name: 'R', email: 'reset@test.dev', password: 'password123' });

    const unknown = await raw(server.app, 'POST', '/auth/forgot', { form: { email: 'ghost@test.dev' } });
    const known = await raw(server.app, 'POST', '/auth/forgot', { form: { email: 'reset@test.dev' } });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(known.body).toContain('reset link');
  });

  it('resets the password with a valid token and rejects an invalid one', async () => {
    server = createServer(persistent);
    const accounts = new AccountService(server.db);
    await accounts.createAccount({ name: 'R', email: 'reset2@test.dev', password: 'password123' });
    const token = accounts.createPasswordResetToken('reset2@test.dev')!.token;

    const bad = await raw(server.app, 'POST', '/auth/reset', { form: { token: 'nope', password: 'brandnewpass', confirm: 'brandnewpass' } });
    expect(bad.status).toBe(400);

    const ok = await raw(server.app, 'POST', '/auth/reset', { form: { token, password: 'brandnewpass', confirm: 'brandnewpass' } });
    expect(ok.status).toBe(200);
    expect(await accounts.login('reset2@test.dev', 'brandnewpass')).not.toBeNull();
  });

  it('resetting a password also revokes OAuth access tokens and API tokens (not just web sessions)', async () => {
    server = createServer(persistent);
    const accounts = new AccountService(server.db);
    const user = await accounts.createAccount({ name: 'R', email: 'reset3@test.dev', password: 'password123' });

    server.db.prepare('INSERT INTO oauth_tokens (access_token, user_id, client_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run('oauth-tok-reset', user.id, 'claude-desktop', Date.now(), Date.now() + 1000000);
    server.db.prepare(`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, scopes) VALUES ('tok-id-reset', ?, 'CI token', 'hash2', 'prefix2', 'read,write')`)
      .run(user.id);

    const token = accounts.createPasswordResetToken('reset3@test.dev')!.token;
    const ok = await raw(server.app, 'POST', '/auth/reset', { form: { token, password: 'brandnewpass', confirm: 'brandnewpass' } });
    expect(ok.status).toBe(200);

    expect(server.db.prepare('SELECT COUNT(*) AS n FROM oauth_tokens WHERE user_id = ?').get(user.id)).toEqual({ n: 0 });
    const apiToken = server.db.prepare('SELECT revoked_at FROM api_tokens WHERE id = ?').get('tok-id-reset') as { revoked_at: string | null };
    expect(apiToken.revoked_at).not.toBeNull();
  });

  it('verifies an email via the verification link', async () => {
    server = createServer(persistent);
    const accounts = new AccountService(server.db);
    const user = await accounts.createAccount({ name: 'V', email: 'verify@test.dev', password: 'password123' });
    const token = accounts.createEmailVerificationToken(user.id);

    expect(accounts.getVerification(user.id).email_verified).toBe(false);
    const res = await raw(server.app, 'GET', `/auth/verify?token=${token}`);
    expect(res.status).toBe(200);
    expect(accounts.getVerification(user.id).email_verified).toBe(true);
  });
});
