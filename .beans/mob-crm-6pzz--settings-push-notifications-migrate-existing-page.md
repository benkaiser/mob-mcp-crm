---
# mob-crm-6pzz
title: 'Settings: push notifications (migrate existing page into SPA)'
status: completed
type: feature
priority: low
created_at: 2026-05-29T13:50:14Z
updated_at: 2026-05-29T15:38:29Z
parent: mob-crm-2py4
---

Migrate the existing /web/notifications push-management page into the SPA settings.

## Design
- Reuse existing push subscribe/unsubscribe APIs (/api/push/*) + VAPID public key endpoint + service worker.
- SPA settings section: enable/disable push, show subscription status/count, test notification button (if available).
- Keep the old EJS page working (or redirect to SPA) for backward compatibility with notification links.

## Checklist
- [x] SPA push settings section using existing /api/push endpoints
- [x] Subscription status + enable/disable
- [x] Backward-compatible handling of old /web/notifications route
- [x] Tests: subscribe/unsubscribe flow (mocked) ; render
