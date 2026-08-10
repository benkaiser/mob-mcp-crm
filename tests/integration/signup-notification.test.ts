import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';
import { EmailService } from '../../src/services/email.js';

function raw(app: Express, method: string, path: string, body?: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = {};
      if (payload !== undefined) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = String(Buffer.byteLength(payload)); }
      const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method, headers }, (r) => {
        let data = '';
        r.on('data', (c: Buffer) => { data += c.toString(); });
        r.on('end', () => { server.close(); resolve({ status: r.statusCode ?? 0, body: data }); });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe('Signup owner notification email', () => {
  let server: ReturnType<typeof createServer> | null = null;
  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('emails the operator with the new user name and email on registration', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const emailService = new EmailService({ from: 'Mob <no-reply@test.dev>', transport: { sendMail } as any });
    const config: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0', emailService };
    server = createServer(config);

    const res = await raw(server.app, 'POST', '/auth/register', { name: 'Jane Doe', email: 'jane@test.dev', password: 'password123' });
    expect(res.status).toBe(201);
    await flush();

    const notify = sendMail.mock.calls.map((c) => c[0]).find((m) => m.to === 'mobnewusersignup@kaiser.lol');
    expect(notify).toBeTruthy();
    expect(notify.subject).toBe('New Mob signup');
    expect(notify.text).toContain('Jane Doe');
    expect(notify.text).toContain('jane@test.dev');
  });

  it('does not fail signup when SMTP is disabled', async () => {
    const config: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' };
    server = createServer(config);

    const res = await raw(server.app, 'POST', '/auth/register', { name: 'No SMTP', email: 'nosmtp@test.dev', password: 'password123' });
    expect(res.status).toBe(201);
  });
});
