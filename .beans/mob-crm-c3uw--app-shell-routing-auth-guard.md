---
# mob-crm-c3uw
title: App shell, routing, auth guard
status: completed
type: task
priority: high
created_at: 2026-05-29T13:47:58Z
updated_at: 2026-05-29T15:02:05Z
parent: mob-crm-rl0m
---

The SPA skeleton: layout, client routing, and auth gating.

## Design
- wouter routes under base `/app`: /, /contacts, /contacts/:id, /activities, /reminders, /gifts, /debts, /tasks, /tags, /search, /settings, etc. (stubs now; filled by later epics).
- Persistent layout: top navbar (reuse colors from _head.ejs: #1e293b nav, #2563eb accent), nav links, user menu (logout), responsive/mobile.
- Auth guard: on load, call `/web/api/me`; if 401, redirect browser to `/web/login?redirect=/app...`. Store current user + plan usage in a signal.
- 404 route + basic not-found view.

## Checklist
- [x] Layout shell (navbar, content area, responsive)
- [x] wouter route table with stub pages
- [x] Auth bootstrap via /web/api/me + redirect on 401
- [x] Current-user/plan signal populated at startup
- [x] Logout action
- [x] 404 view
- [x] Test: unauthenticated load redirects; authenticated load renders shell
