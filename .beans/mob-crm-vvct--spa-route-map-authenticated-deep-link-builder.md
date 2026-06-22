---
# mob-crm-vvct
title: SPA route map + authenticated deep-link builder
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:51:55Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-hq5x
---

Deterministic mapping from entities to SPA routes + a helper that builds an authenticated deep-link.

## Design
- Central route map: contact -> /app/contacts/:id, activity -> /app/activities/:id, reminder -> /app/reminders/:id, gift, debt, task, life event, note list, timeline.
- deepLink(userId, entityType, id) helper in the MCP/server layer: builds `${base_url}/web/auto-login?token=<one-time>&redirect=/app/...` using accountService auto-login token issuance (already exists) so the user lands authenticated.
- base_url already stored in server_config.
- Forgetful mode: no persistent account -> return a non-authenticated link or omit (decide + document).

## Checklist
- [x] Central entity->route map (shared constant)
- [x] deepLink helper using auto-login token + base_url
- [x] Forgetful-mode behavior decided + handled
- [x] Tests: link format, auto-login token round-trip lands authenticated, forgetful behavior
