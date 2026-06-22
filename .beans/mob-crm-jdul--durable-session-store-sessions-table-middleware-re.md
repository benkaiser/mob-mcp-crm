---
# mob-crm-jdul
title: Durable session store (sessions table + middleware refactor)
status: completed
type: task
priority: critical
created_at: 2026-05-29T13:47:22Z
updated_at: 2026-05-29T13:58:34Z
parent: mob-crm-yhfl
---

Replace the in-memory `webSessions` Map in http-server.ts with a durable, restart-safe `sessions` table.

## Why
Today `webSessions = new Map()` loses all logins on restart and can't scale to multiple instances. Everything web-facing depends on durable sessions.

## Design
- Migration `009-sessions.sql`: `sessions(token TEXT PK, user_id TEXT, created_at, last_seen_at, expires_at, user_agent, ip)`; index on user_id.
- `SessionService` (src/services/sessions.ts): create(userId, meta) -> token; get(token) -> session|null (and refresh last_seen / sliding expiry); destroy(token); destroyAllForUser(userId); cleanupExpired().
- Refactor `requireWebSession` and all webSessions.get/set/delete call sites in http-server.ts to use SessionService.
- Keep cookie name `mob_session`, HttpOnly, SameSite=Lax; add Secure when behind https (base_url).
- Forgetful mode: keep ephemeral behavior but still route through SessionService (in-memory db) so the code path is unified.
- Periodic cleanup: fold into the existing cleanupInterval.

## Checklist
- [x] Migration 009-sessions.sql
- [x] SessionService with create/get/destroy/destroyAllForUser/cleanupExpired
- [x] Refactor http-server.ts to use SessionService everywhere webSessions is used
- [x] Sliding expiry + Secure cookie when https
- [x] Wire cleanup into existing interval
- [x] Tests: create/get/expire/destroy; restart simulation (new SessionService over same db sees session); auth middleware redirect on missing/expired
