---
# mob-crm-jzst
title: OpenAPI spec + /api/v1/docs page
status: completed
type: task
priority: low
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-b6eq
---

Document the public API.

## Design
- Author an OpenAPI 3 spec covering all /api/v1 endpoints (or generate from route definitions/zod schemas if feasible).
- Serve a docs page at /api/v1/docs (e.g., Redoc/Swagger UI static, or a lightweight rendered page) + the raw spec at /api/v1/openapi.json.
- Include auth (bearer token), rate limits, pagination, error envelope, webhook signature verification guide.

## Checklist
- [x] OpenAPI 3 spec for all /api/v1 endpoints
- [x] /api/v1/openapi.json + /api/v1/docs page
- [x] Auth/rate-limit/webhook docs included
- [x] Test: spec served + valid JSON; docs route 200
