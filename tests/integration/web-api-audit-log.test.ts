import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import { AccountService } from '../../src/auth/accounts.js';

let server: ReturnType<typeof createServer> | null = null;

describe('Audit log internal API', () => {
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('requires authentication', async () => {
    server = createServer({ port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' });
    const base = await listen(server);
    try {
      const res = await fetch(`${base.url}/web/api/audit-log`);
      expect(res.status).toBe(401);
    } finally {
      base.close();
    }
  });

  it('returns paginated audit entries for the logged-in user', async () => {
    server = createServer({ port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' });
    await new AccountService(server.db).createAccount({ name: 'Audit User', email: 'audit@test.dev', password: 'password123', plan: 'unlimited' });
    const base = await listen(server);
    try {
      const client = await login(base.url, 'audit@test.dev');
      const create = await client.mutate(base.url, 'POST', '/web/api/contacts', { first_name: 'Logged' });
      expect(create.status).toBe(201);

      const res = await client.get(base.url, '/web/api/audit-log?per_page=5');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
      expect(body.data[0]).toMatchObject({ entity_type: 'contact', action: 'create' });
    } finally {
      base.close();
    }
  });

  it('works in forgetful mode', async () => {
    server = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const base = await listen(server);
    try {
      const loginRes = await fetch(`${base.url}/web/login`, { redirect: 'manual' });
      const session = cookieFrom(loginRes, 'mob_session');
      const csrfRes = await fetch(`${base.url}/web/api/me`, { headers: { Cookie: `mob_session=${session}` } });
      const csrf = cookieFrom(csrfRes, 'mob_csrf');

      const create = await fetch(`${base.url}/web/api/contacts`, {
        method: 'POST',
        headers: { Cookie: `mob_session=${session}; mob_csrf=${csrf}`, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: 'Ephemeral' }),
      });
      expect(create.status).toBe(201);

      const log = await fetch(`${base.url}/web/api/audit-log`, { headers: { Cookie: `mob_session=${session}` } });
      expect(log.status).toBe(200);
      const body = await log.json();
      expect(body.data.some((e: any) => e.entity_type === 'contact' && e.action === 'create')).toBe(true);
    } finally {
      base.close();
    }
  });
});

async function listen(srv: ReturnType<typeof createServer>): Promise<{ url: string; close: () => void }> {
  const http = await import('node:http');
  const listener = http.createServer(srv.app);
  await new Promise<void>((resolve) => listener.listen(0, resolve));
  const port = (listener.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => listener.close() };
}

async function login(baseUrl: string, email: string) {
  const loginRes = await fetch(`${baseUrl}/web/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: 'password123' }),
  });
  const session = cookieFrom(loginRes, 'mob_session');
  const me = await fetch(`${baseUrl}/web/api/me`, { headers: { Cookie: `mob_session=${session}` } });
  const csrf = cookieFrom(me, 'mob_csrf');
  return {
    get: (url: string, path: string) => fetch(`${url}${path}`, { headers: { Cookie: `mob_session=${session}; mob_csrf=${csrf}` } }),
    mutate: (url: string, method: string, path: string, body: unknown) => fetch(`${url}${path}`, {
      method,
      headers: { Cookie: `mob_session=${session}; mob_csrf=${csrf}`, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}

function cookieFrom(res: Response, name: string): string {
  const raw = res.headers.get('set-cookie') ?? '';
  const match = raw.match(new RegExp(`${name}=([^;]+)`));
  if (!match) throw new Error(`missing cookie ${name}`);
  return match[1];
}
