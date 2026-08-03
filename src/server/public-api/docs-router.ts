import { Router } from 'express';
import { buildOpenApiSpec } from './openapi.js';

/**
 * Public documentation router for the REST API.
 *
 * Serves two endpoints - neither requires authentication, since documentation
 * should be world-readable:
 *   - `GET /openapi.json` → the OpenAPI 3.0 spec as JSON.
 *   - `GET /docs`         → a self-contained HTML page rendering the spec with
 *                            Redoc (loaded from a CDN; no npm dependency).
 *
 * IMPORTANT (mounting): this router must be reachable WITHOUT the bearer-auth +
 * plan-gating middleware that `createPublicApiRouter` installs. Mount it on
 * `/api/v1` BEFORE the authed public-API router in http-server.ts:
 *
 *   app.use('/api/v1', createDocsRouter());                 // public docs
 *   app.use('/api/v1', createPublicApiRouter({ ... }));      // authed API
 *
 * Express matches in registration order, so `/api/v1/docs` and
 * `/api/v1/openapi.json` resolve here first and never hit the auth pipeline.
 */
export function createDocsRouter(): Router {
  const router = Router();

  router.get('/openapi.json', (_req, res) => {
    res.json(buildOpenApiSpec());
  });

  router.get('/docs', (_req, res) => {
    res.type('html').send(DOCS_HTML);
  });

  return router;
}

const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mob CRM API Reference</title>
    <style>
      body { margin: 0; padding: 0; }
    </style>
  </head>
  <body>
    <redoc spec-url="/api/v1/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`;
