---
# mob-crm-v7md
title: Service worker app-shell caching (preserve push handlers)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:51:38Z
updated_at: 2026-05-29T15:38:29Z
parent: mob-crm-4ovv
---

Extend the existing service worker for offline app-shell caching WITHOUT breaking push.

## Design
- Current service-worker.js handles push + notificationclick. Add install/activate + fetch handlers:
  - Precache the SPA shell + hashed Vite assets (cache-first for /app static assets).
  - Network-first (with timeout) for /web/api + /api; fall back to cache where sensible (read GETs only).
  - Cache versioning keyed to build hash; cleanup old caches on activate.
- Ensure SW is served with correct scope; integrate with Vite build output (asset manifest).
- Do NOT cache auth/mutation requests; never serve stale auth.

## Checklist
- [x] Add install/activate/fetch without removing push/notificationclick
- [x] Cache-first assets, network-first API (GET only), versioned caches
- [x] Build integration (precache Vite hashed assets)
- [x] Tests: SW logic unit-tested where feasible; manual offline-shell verification noted
