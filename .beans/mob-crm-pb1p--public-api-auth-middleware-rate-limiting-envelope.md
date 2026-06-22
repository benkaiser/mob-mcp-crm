---
# mob-crm-pb1p
title: Public API auth middleware + rate limiting + envelope + versioning
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-b6eq
---

Foundational middleware for /api/v1.

## Design
- Bearer token auth middleware: parse Authorization: Bearer <token>, verify via ApiTokenService, attach userId+scopes; 401 on failure.
- Rate limiting per token (configurable; e.g. token-bucket in SQLite or in-memory with limits) -> 429 + Retry-After.
- Consistent JSON envelope + error codes mirroring internal API but versioned; pagination identical convention.
- Versioning under /api/v1; document deprecation policy.
- Scope enforcement helper (read vs write per resource).

## Checklist
- [x] Bearer auth middleware (token verify + scopes)
- [x] Rate limiting (429 + Retry-After)
- [x] Envelope + error codes + pagination
- [x] Scope enforcement helper
- [x] Tests: auth pass/fail, rate limit trip, scope denial, envelope shape
