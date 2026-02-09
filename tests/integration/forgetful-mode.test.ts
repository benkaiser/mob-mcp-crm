import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';

describe('Forgetful Mode', () => {
  let serverInstance: ReturnType<typeof createServer>;

  afterEach(() => {
    if (serverInstance) {
      serverInstance.stop();
    }
  });

  it('should start in forgetful mode with in-memory database', () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true });
    expect(serverInstance.db).toBeDefined();
    // In-memory database should be functional
    const result = serverInstance.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should report forgetful mode in health check', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true });
    const app = serverInstance.app;

    // Use direct supertest-like approach
    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.mode).toBe('forgetful');
    } finally {
      server.close();
    }
  });

  it('should report persistent mode in health check', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: false });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      const response = await fetch(`http://localhost:${port}/health`);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.mode).toBe('persistent');
    } finally {
      server.close();
    }
  });

  it('should auto-approve OAuth in forgetful mode', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      // In forgetful mode, authorize without credentials
      const authResponse = await fetch(`http://localhost:${port}/auth/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'test-client',
          code_challenge: 'test-challenge',
          code_challenge_method: 'plain',
          redirect_uri: 'http://localhost/callback',
        }),
      });

      const authData = await authResponse.json() as any;
      expect(authData.code).toBeDefined();

      // Exchange code for token
      const tokenResponse = await fetch(`http://localhost:${port}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: authData.code,
          code_verifier: 'test-challenge',
          client_id: 'test-client',
          redirect_uri: 'http://localhost/callback',
        }),
      });

      const tokenData = await tokenResponse.json() as any;
      expect(tokenData.access_token).toBeDefined();
    } finally {
      server.close();
    }
  });
});
