---
# mob-crm-vmcn
title: Push subscription in SPA + notification deep-linking
status: completed
type: feature
priority: low
created_at: 2026-05-29T13:51:38Z
updated_at: 2026-05-29T15:38:29Z
parent: mob-crm-4ovv
---

Keep push working through the SPA and deep-link notification clicks to SPA routes.

## Design
- SPA reuses /api/vapid-public-key + /api/push/subscribe|unsubscribe (already exist).
- notificationclick in service worker should open the deep target (/app/reminders/:id etc.) — coordinate with the SPA route map (epic 10) and the old /web/reminder/:id redirect.

## Checklist
- [x] SPA push enable/disable using existing endpoints
- [x] notificationclick opens correct SPA route (deep-link)
- [x] Tests: subscribe flow (mocked) + click routing
