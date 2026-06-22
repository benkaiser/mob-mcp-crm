---
# mob-crm-yth0
title: Web manifest + icons + theme + install affordance
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:51:38Z
updated_at: 2026-05-29T15:38:29Z
parent: mob-crm-4ovv
---

Make the SPA installable.

## Design
- Add /manifest.webmanifest: name "Mob", short_name, description, icons (reuse favicon-192.png + add 512 if needed), theme_color (#1e293b), background_color, display standalone, start_url /app, scope /app.
- Link manifest from the SPA index + EJS head.
- Install affordance: capture beforeinstallprompt; show an "Install app" button in the UI when available; iOS instructions fallback.

## Checklist
- [x] manifest.webmanifest + icons (192/512) + theme colors
- [x] Linked from SPA + served by Express
- [x] Install button (beforeinstallprompt) + iOS fallback
- [x] Test: manifest served + valid; install affordance renders when eligible
