import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import type { Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';

interface Res { status: number; body: string; headers: http.IncomingHttpHeaders }

function inject(
  app: Express,
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string>; form?: Record<string, string>; followRedirect?: boolean } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      let payload: string | undefined;
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (opts.form) {
        payload = new URLSearchParams(opts.form).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (opts.body) {
        payload = JSON.stringify(opts.body);
        headers['Content-Type'] = 'application/json';
      }
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

const persistentConfig: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' };
const verifier = 'test-verifier-that-is-long-enough';
const challenge = createHash('sha256').update(verifier).digest('base64url');

describe('Unified auth bridge (web <-> MCP)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  async function makeUser(srv: ReturnType<typeof createServer>) {
    const accounts = new AccountService(srv.db);
    await accounts.createAccount({ name: 'Bandit Heeler', email: 'bandit@heeler.family', password: 'wackadoo123' });
  }

  it('web session requires explicit consent before minting an MCP authorization code', async () => {
    server = createServer(persistentConfig);
    await makeUser(server);

    // Log in to the web app.
    const login = await inject(server.app, 'POST', '/web/login', {
      form: { email: 'bandit@heeler.family', password: 'wackadoo123' },
    });
    const session = cookieFrom(login.headers, 'mob_session');
    expect(session).toBeDefined();

    // JSON callers with a web session still need the browser consent step.
    const authz = await inject(server.app, 'POST', '/auth/authorize', {
      headers: { Cookie: `mob_session=${session}` },
      body: { client_id: 'test-client', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: 'http://localhost/cb' },
    });
    expect(authz.status).toBe(403);
    const body = JSON.parse(authz.body);
    expect(body.error).toBe('authorization_confirmation_required');
  });

  it('browser OAuth login establishes a web session and then redirects after consent', async () => {
    server = createServer(persistentConfig);
    await makeUser(server);

    const authz = await inject(server.app, 'POST', '/auth/authorize', {
      form: {
        email: 'bandit@heeler.family',
        password: 'wackadoo123',
        client_id: 'test-client',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: 'joey://mcp-oauth/callback',
      },
    });
    expect(authz.status).toBe(200);
    expect(authz.body).toContain('Confirm MCP client access');
    expect(authz.body).toContain('joey://mcp-oauth/callback');
    const session = cookieFrom(authz.headers, 'mob_session');
    expect(session).toBeDefined();

    const consent = await inject(server.app, 'POST', '/auth/authorize', {
      headers: { Cookie: `mob_session=${session}` },
      form: {
        confirm_authorize: '1',
        client_id: 'test-client',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: 'joey://mcp-oauth/callback',
        state: 'state-123',
      },
    });
    expect(consent.status).toBe(302);
    expect(consent.headers.location).toMatch(/^joey:\/\/mcp-oauth\/callback\?code=/);
    expect(consent.headers.location).toContain('state=state-123');
  });

  it('requires credentials when no web session is present', async () => {
    server = createServer(persistentConfig);
    const authz = await inject(server.app, 'POST', '/auth/authorize', {
      body: { client_id: 'test-client', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: 'http://localhost/cb' },
    });
    expect(authz.status).toBe(400);
  });

  it('allows arbitrary absolute redirect URIs but shows them for consent', async () => {
    server = createServer(persistentConfig);
    await makeUser(server);

    const authz = await inject(server.app, 'POST', '/auth/authorize', {
      form: {
        email: 'bandit@heeler.family',
        password: 'wackadoo123',
        client_id: 'desktop-client',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: 'com.example.mob-client://oauth/callback',
      },
    });

    expect(authz.status).toBe(200);
    expect(authz.body).toContain('com.example.mob-client://oauth/callback');
  });
});
