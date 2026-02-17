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
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    expect(serverInstance.db).toBeDefined();
    // In-memory database should be functional
    const result = serverInstance.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should report forgetful mode in health check', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
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
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: false, baseUrl: 'http://localhost:0' });
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

  it('should reject OAuth in forgetful mode (OAuth is disabled)', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      // In forgetful mode, OAuth authorize should be rejected
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

      // Should reject with 404 since OAuth is disabled in forgetful mode
      expect(authResponse.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('should allow direct MCP connection without OAuth in forgetful mode', async () => {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;

    const { default: http } = await import('node:http');
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const port = address.port;

    try {
      // Connect to /mcp directly — no OAuth needed
      const initResponse = await fetch(`http://localhost:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0' },
          },
        }),
      });

      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.headers.get('mcp-session-id');
      expect(sessionId).toBeDefined();
      expect(sessionId).not.toBeNull();
    } finally {
      server.close();
    }
  });
});
