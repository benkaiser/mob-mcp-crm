import { describe, it, expect } from 'vitest';
import http from 'node:http';
import express, { type Express } from 'express';
import { createDocsRouter } from '../../src/server/public-api/docs-router.js';
import { buildOpenApiSpec } from '../../src/server/public-api/openapi.js';

interface Res { status: number; body: string; headers: http.IncomingHttpHeaders }

function get(app: Express, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { server.close(); reject(new Error('Bad address')); return; }
      const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method: 'GET' }, (r) => {
        let data = '';
        r.on('data', (c: Buffer) => { data += c.toString(); });
        r.on('end', () => { server.close(); resolve({ status: r.statusCode ?? 0, body: data, headers: r.headers }); });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      req.end();
    });
  });
}

function makeApp(): Express {
  const app = express();
  // Mounted on /api/v1 with NO auth middleware, mirroring the public mount.
  app.use('/api/v1', createDocsRouter());
  return app;
}

describe('public API docs router', () => {
  it('serves the OpenAPI spec as JSON at /openapi.json', async () => {
    const res = await get(makeApp(), '/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const spec = JSON.parse(res.body) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
    expect(typeof spec.paths).toBe('object');
    expect(spec.paths['/contacts']).toBeDefined();
  });

  it('serves an HTML docs page at /docs without auth', async () => {
    const res = await get(makeApp(), '/api/v1/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<redoc');
    expect(res.body).toContain('/api/v1/openapi.json');
  });
});

describe('buildOpenApiSpec structural validity', () => {
  const spec = buildOpenApiSpec() as {
    openapi: string;
    info: { title: string };
    components: { securitySchemes: Record<string, { type: string; scheme?: string }> };
    paths: Record<string, unknown>;
  };

  it('declares openapi 3.0.x', () => {
    expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
  });

  it('has an info.title', () => {
    expect(spec.info.title).toBeTruthy();
  });

  it('defines a bearerAuth security scheme', () => {
    const scheme = spec.components.securitySchemes.bearerAuth;
    expect(scheme).toBeDefined();
    expect(scheme.type).toBe('http');
    expect(scheme.scheme).toBe('bearer');
  });

  it('documents a non-empty set of paths including /contacts', () => {
    const keys = Object.keys(spec.paths);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain('/contacts');
    expect(keys).toContain('/me');
  });
});
