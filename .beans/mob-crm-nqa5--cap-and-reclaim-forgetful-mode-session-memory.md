---
# mob-crm-nqa5
title: Cap and reclaim forgetful-mode session memory
status: completed
type: bug
priority: normal
created_at: 2026-10-03T12:01:24Z
updated_at: 2026-10-03T12:04:42Z
---

mob-test (forgetful demo) RSS grows unbounded.

Root causes in src/server/http-server.ts:
1. GET /web/login in forgetful mode clones a full in-memory SQLite DB on EVERY request, even when the caller already has a valid session cookie. Bots/crawlers/repeat visits each leak a clone.
2. /web/logout deletes the forgetfulWebSessions token but never closes or removes the forgetfulSessions['web-<id>'] cloned DB. Leaked forever.
3. Web clones have no TTL/eviction at all; MCP clones are only freed on transport.onclose, which never fires if a client vanishes without DELETE /mcp.
4. No cap on concurrent sessions, and the documented 2-hour forgetful TTL is not implemented.
5. Each clone sets cache_size=-64000 (64MB) and retains a full McpServer instance.

## Checklist
- [x] Reuse existing web session cookie on /web/login instead of cloning per hit
- [x] Close + remove cloned DB on /web/logout
- [x] Track createdAt/lastSeen per forgetful session, touch on each request
- [x] Sweep idle/expired sessions (idle TTL + 2h hard TTL) on an interval
- [x] Cap concurrent forgetful sessions, evict oldest over cap
- [x] Sweep stale MCP transports in persistent mode too
- [x] Lower clone cache_size
- [x] Tests