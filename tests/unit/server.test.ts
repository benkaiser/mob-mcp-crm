import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';

const testConfig: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' };

describe('HTTP Server', () => {
  let server: ReturnType<typeof createServer> | null = null;

  afterEach(() => {
    if (server) {
      server.stop();
      server = null;
    }
  });

  it('should create a server with the given config', () => {
    server = createServer(testConfig);
    expect(server).toBeDefined();
    expect(server.start).toBeInstanceOf(Function);
    expect(server.stop).toBeInstanceOf(Function);
    expect(server.app).toBeDefined();
    expect(server.db).toBeDefined();
  });

  it('should serve homepage at /', async () => {
    server = createServer(testConfig);
    // Use supertest-style: import the express app directly
    const response = await injectRequest(server.app, 'GET', '/');
    expect(response.status).toBe(200);
    expect(response.body).toContain('Mob');
    expect(response.body).toContain('AI-First Personal CRM');
  });

  it('should respond to health check', async () => {
    server = createServer(testConfig);
    const response = await injectRequest(server.app, 'GET', '/health');
    expect(response.status).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.status).toBe('ok');
    expect(data.mode).toBe('forgetful');
  });

  it('should reject MCP POST without session or init request', async () => {
    server = createServer(testConfig);
    const response = await injectRequest(server.app, 'POST', '/mcp', {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
    });
    expect(response.status).toBe(401);
  });

  it('should reject MCP GET without session', async () => {
    server = createServer(testConfig);
    const response = await injectRequest(server.app, 'GET', '/mcp');
    expect(response.status).toBe(401);
  });
});

// ─── Lightweight request injection ─────────────────────────────

import http from 'node:http';
import type { Express } from 'express';

interface InjectedResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function injectRequest(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<InjectedResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }

      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers });
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}
