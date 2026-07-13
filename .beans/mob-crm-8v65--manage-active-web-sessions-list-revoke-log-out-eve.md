---
# mob-crm-8v65
title: Manage active web sessions (list / revoke / log out everywhere)
status: completed
type: feature
priority: normal
created_at: 2026-07-12T23:50:27Z
updated_at: 2026-07-13T00:38:51Z
parent: mob-crm-rqef
---

Durable web sessions exist (009-sessions migration) but users can't see or revoke them. Add session management for security.

## Requirements
- `GET /web/api/account/sessions`: list the user's sessions (id, created_at, last_seen, user-agent/IP if captured, and which is current).
- `DELETE /web/api/account/sessions/:id` to revoke a single session, and `POST /web/api/account/sessions/revoke-all` (log out everywhere, optionally keeping the current one).
- Settings 'Active sessions' section with per-session revoke + 'Log out everywhere' button.
- If session rows don't already store user-agent/IP/last_seen, add a migration to capture them (nice-to-have; degrade gracefully if absent).
- User-scoped only.

## Files
- Session store/middleware in `src/server/http-server.ts`; account api router; `web/src/pages/Settings.tsx`.

## Checklist
- [x] Session store: list + revoke(one) + revoke-all(user) helpers
- [x] (Optional) migration for user-agent/IP/last_seen on sessions
- [x] GET/DELETE/POST session routes
- [x] Settings 'Active sessions' UI (revoke + log out everywhere)
- [x] Tests: list own sessions, revoke, revoke-all keeps current, cross-tenant denied