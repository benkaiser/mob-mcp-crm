---
# mob-crm-qd4k
title: Roll out Bubble Roo (Azure) as app icon
status: completed
type: task
priority: normal
created_at: 2026-05-30T14:00:48Z
updated_at: 2026-05-30T14:02:44Z
---

Adopt 8-bubble-roo-azure as the official app icon.

## Checklist
- [x] Add icon SVG (with bg) to web/public/icons/icon.svg
- [x] Add transparent logo SVG (no bg) for sidebar to web/public/logo.svg
- [x] Generate PWA PNGs: icon-192, icon-512, icon-maskable-512
- [x] Add SVG favicon + reference in web/index.html
- [x] Use logo in AppShell sidebar brand (replace emoji)
- [x] Add sidebar brand logo CSS
- [x] Rebuild web and verify (build OK, lint OK, typecheck errors pre-existing in http-server.ts only)