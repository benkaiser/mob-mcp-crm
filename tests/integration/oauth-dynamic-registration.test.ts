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
  opts: { body?: unknown; headers?: Record<string, string>; form?: Record<string, string> } = {},
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

const persistentConfig: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' };
const verifier = 'test-verifier-that-is-long-enough';
const challenge = createHash('sha256').update(verifier).digest('base64url');

describe('OAuth dynamic client registration (RFC 7591)', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  async function makeUser(srv: ReturnType<typeof createServer>) {
    const accounts = new AccountService(srv.db);
    return accounts.createAccount({ name: 'Bluey Heeler', email: 'bluey@heeler.family', password: 'keepyuppy123' });
  }

  it('advertises the registration endpoint in authorization server metadata', async () => {
    server = createServer(persistentConfig);
    const res = await inject(server.app, 'GET', '/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    const metadata = JSON.parse(res.body);
    expect(metadata.registration_endpoint).toBe('http://localhost:0/auth/register-client');
    expect(metadata.grant_types_supported).toContain('authorization_code');
  });

  it('registers a public client and returns a client_id without a secret', async () => {
    server = createServer(persistentConfig);
    const res = await inject(server.app, 'POST', '/auth/register-client', {
      body: { client_name: 'Codex', redirect_uris: ['http://localhost:1455/auth/callback'] },
    });

    expect(res.status).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.client_id).toMatch(/^mcp_[0-9a-f]{32}$/);
    expect(body.client_name).toBe('Codex');
    expect(body.redirect_uris).toEqual(['http://localhost:1455/auth/callback']);
    expect(body.grant_types).toEqual(['authorization_code']);
    expect(body.response_types).toEqual(['code']);
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body.client_secret).toBeUndefined();
    expect(typeof body.client_id_issued_at).toBe('number');
  });

  it('issues a client secret for confidential clients', async () => {
    server = createServer(persistentConfig);
    const res = await inject(server.app, 'POST', '/auth/register-client', {
      body: {
        client_name: 'Confidential client',
        redirect_uris: ['https://example.com/callback'],
        token_endpoint_auth_method: 'client_secret_post',
      },
    });

    expect(res.status).toBe(201);
    const body = JSON.parse(res.body);
    expect(typeof body.client_secret).toBe('string');
    expect(body.client_secret_expires_at).toBe(0);
  });

  it('rejects registration without redirect_uris', async () => {
    server = createServer(persistentConfig);
    const res = await inject(server.app, 'POST', '/auth/register-client', {
      body: { client_name: 'No redirects' },
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_redirect_uri');
  });

  it('rejects registration with a non-loopback http redirect_uri', async () => {
    server = createServer(persistentConfig);
    const res = await inject(server.app, 'POST', '/auth/register-client', {
      body: { redirect_uris: ['http://evil.example.com/callback'] },
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_redirect_uri');
  });

  it('rejects registration with a script-capable redirect_uri scheme', async () => {
    server = createServer(persistentConfig);
    for (const uri of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) {
      const res = await inject(server.app, 'POST', '/auth/register-client', {
        body: { redirect_uris: [uri] },
      });
      expect(res.status, uri).toBe(400);
      expect(JSON.parse(res.body).error).toBe('invalid_redirect_uri');
    }
  });

  it('allows custom app scheme redirect URIs', async () => {
    server = createServer(persistentConfig);
    const res = await inject(server.app, 'POST', '/auth/register-client', {
      body: { redirect_uris: ['mob-client://oauth/callback'] },
    });
    expect(res.status).toBe(201);
  });

  it('rejects registration with an unsupported grant type', async () => {
    server = createServer(persistentConfig);
    const res = await inject(server.app, 'POST', '/auth/register-client', {
      body: { redirect_uris: ['https://example.com/cb'], grant_types: ['password'] },
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_client_metadata');
  });

  it('completes the full register → authorize → token flow', async () => {
    server = createServer(persistentConfig);
    await makeUser(server);

    const registration = JSON.parse((await inject(server.app, 'POST', '/auth/register-client', {
      body: { client_name: 'Codex', redirect_uris: ['http://localhost:1455/auth/callback'] },
    })).body);

    const authorize = await inject(server.app, 'POST', '/auth/authorize', {
      body: {
        email: 'bluey@heeler.family',
        password: 'keepyuppy123',
        client_id: registration.client_id,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: 'http://localhost:1455/auth/callback',
      },
    });
    expect(authorize.status).toBe(200);
    const { code } = JSON.parse(authorize.body);
    expect(code).toBeDefined();

    const token = await inject(server.app, 'POST', '/auth/token', {
      body: {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        client_id: registration.client_id,
        redirect_uri: 'http://localhost:1455/auth/callback',
      },
    });
    expect(token.status).toBe(200);
    const tokenBody = JSON.parse(token.body);
    expect(tokenBody.access_token).toBeDefined();
    expect(tokenBody.token_type).toBe('Bearer');
  });

  it('rejects an authorize request using an unregistered redirect_uri', async () => {
    server = createServer(persistentConfig);
    await makeUser(server);

    const registration = JSON.parse((await inject(server.app, 'POST', '/auth/register-client', {
      body: { redirect_uris: ['http://localhost:1455/auth/callback'] },
    })).body);

    const authorize = await inject(server.app, 'POST', '/auth/authorize', {
      body: {
        email: 'bluey@heeler.family',
        password: 'keepyuppy123',
        client_id: registration.client_id,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: 'http://localhost:1455/attacker',
      },
    });

    expect(authorize.status).toBe(400);
    expect(JSON.parse(authorize.body).error_description).toContain('not registered');
  });

  it('requires client authentication at the token endpoint for confidential clients', async () => {
    server = createServer(persistentConfig);
    await makeUser(server);

    const registration = JSON.parse((await inject(server.app, 'POST', '/auth/register-client', {
      body: {
        redirect_uris: ['https://example.com/callback'],
        token_endpoint_auth_method: 'client_secret_post',
      },
    })).body);

    async function getCode(): Promise<string> {
      const authorize = await inject(server!.app, 'POST', '/auth/authorize', {
        body: {
          email: 'bluey@heeler.family',
          password: 'keepyuppy123',
          client_id: registration.client_id,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          redirect_uri: 'https://example.com/callback',
        },
      });
      return JSON.parse(authorize.body).code;
    }

    const withoutSecret = await inject(server.app, 'POST', '/auth/token', {
      body: {
        grant_type: 'authorization_code',
        code: await getCode(),
        code_verifier: verifier,
        client_id: registration.client_id,
        redirect_uri: 'https://example.com/callback',
      },
    });
    expect(withoutSecret.status).toBe(401);
    expect(JSON.parse(withoutSecret.body).error).toBe('invalid_client');

    const withSecret = await inject(server.app, 'POST', '/auth/token', {
      body: {
        grant_type: 'authorization_code',
        code: await getCode(),
        code_verifier: verifier,
        client_id: registration.client_id,
        client_secret: registration.client_secret,
        redirect_uri: 'https://example.com/callback',
      },
    });
    expect(withSecret.status).toBe(200);
    expect(JSON.parse(withSecret.body).access_token).toBeDefined();
  });

  it('accepts client credentials via HTTP Basic auth', async () => {
    server = createServer(persistentConfig);
    await makeUser(server);

    const registration = JSON.parse((await inject(server.app, 'POST', '/auth/register-client', {
      body: {
        redirect_uris: ['https://example.com/callback'],
        token_endpoint_auth_method: 'client_secret_basic',
      },
    })).body);

    const authorize = await inject(server.app, 'POST', '/auth/authorize', {
      body: {
        email: 'bluey@heeler.family',
        password: 'keepyuppy123',
        client_id: registration.client_id,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: 'https://example.com/callback',
      },
    });
    const { code } = JSON.parse(authorize.body);

    const basic = Buffer.from(`${registration.client_id}:${registration.client_secret}`).toString('base64');
    const token = await inject(server.app, 'POST', '/auth/token', {
      headers: { Authorization: `Basic ${basic}` },
      body: {
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: 'https://example.com/callback',
      },
    });

    expect(token.status).toBe(200);
    expect(JSON.parse(token.body).access_token).toBeDefined();
  });

  it('does not crash on a malformed Basic auth header at the token endpoint', async () => {
    server = createServer(persistentConfig);
    const malformed = Buffer.from('bad%client:secret%zz').toString('base64');
    const res = await inject(server.app, 'POST', '/auth/token', {
      headers: { Authorization: `Basic ${malformed}` },
      body: { grant_type: 'authorization_code', code: 'nope', code_verifier: verifier },
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_grant');
  });

  it('still allows unregistered client_ids (backwards compatibility)', async () => {    server = createServer(persistentConfig);
    await makeUser(server);

    const authorize = await inject(server.app, 'POST', '/auth/authorize', {
      body: {
        email: 'bluey@heeler.family',
        password: 'keepyuppy123',
        client_id: 'legacy-client',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: 'https://legacy.example.com/callback',
      },
    });

    expect(authorize.status).toBe(200);
    expect(JSON.parse(authorize.body).code).toBeDefined();
  });
});
