import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import type { Express } from 'express';
import { createServer } from '../../src/server/http-server.js';
import type { ServerConfig } from '../../src/server/http-server.js';

interface InjectedResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function inject(app: Express, method: string, path: string): Promise<InjectedResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => { server.close(); resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers }); });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      req.end();
    });
  });
}

const forgetfulConfig: ServerConfig = { port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:0' };

describe('public documentation site', () => {
  let server: ReturnType<typeof createServer> | null = null;

  beforeAll(() => {
    execFileSync('node', ['scripts/build-docs.mjs'], { cwd: process.cwd(), stdio: 'pipe' });
  });

  afterEach(() => { if (server) { server.stop(); server = null; } });

  it('serves /docs as unauthenticated HTML without redirect', async () => {
    server = createServer(forgetfulConfig);
    const res = await inject(server.app, 'GET', '/docs');
    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Mob documentation');
  });

  it.each([
    ['/docs/', 'Mob documentation'],
    ['/docs/usage', 'Using Mob'],
    ['/docs/api', 'API and interface audit'],
    ['/docs/mcp', 'MCP setup and architecture'],
  ])('serves %s without auth', async (path, heading) => {
    server = createServer(forgetfulConfig);
    const res = await inject(server.app, 'GET', path);
    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain(heading);
  });
});
