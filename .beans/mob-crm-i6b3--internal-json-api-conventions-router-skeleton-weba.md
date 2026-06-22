---
# mob-crm-i6b3
title: Internal JSON API conventions + router skeleton (/web/api)
status: completed
type: feature
priority: critical
created_at: 2026-05-29T13:47:22Z
updated_at: 2026-05-29T14:04:52Z
parent: mob-crm-yhfl
---

Establish the internal JSON API surface that the Preact SPA consumes. Session-cookie authed, ungated for free tier (it powers the web UI, which free users get fully).

## Design
- Mount `/web/api/*` behind `requireWebSession` (cookie auth) — NOT token auth.
- Standard response envelope: success `{ data, meta? }`; error `{ error: { code, message, details? } }` with proper HTTP status.
- zod validation helper: parse body/query, return 422 with field errors on failure.
- Pagination helper: `?page&per_page` -> `{ data, total, page, per_page }` consistent with existing service list shape.
- CSRF protection for state-changing requests (double-submit cookie or same-site + custom header check). Document the chosen approach.
- Central async error handler -> envelope.
- A `routeForService` pattern so each entity router is thin: validate -> call service(userId, ...) -> envelope.
- All handlers derive userId from session; never trust client-supplied userId.

## Checklist
- [x] /web/api router mounted under requireWebSession
- [x] Success + error envelope helpers
- [x] zod validation middleware (422 + field errors)
- [x] Pagination helper
- [x] CSRF strategy implemented + documented
- [x] Central async error handler
- [x] Example/health route `/web/api/me` returning current user + plan usage
- [x] Tests: auth required (401/redirect for API -> 401 JSON), validation errors, envelope shape, CSRF rejection, /web/api/me happy path
