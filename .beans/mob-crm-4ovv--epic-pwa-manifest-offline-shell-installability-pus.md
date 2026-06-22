---
# mob-crm-4ovv
title: 'Epic: PWA — manifest, offline shell, installability, push'
status: in-progress
type: epic
priority: normal
created_at: 2026-05-29T13:46:35Z
updated_at: 2026-05-29T15:32:13Z
parent: mob-crm-ehb6
---

Make the web app an installable PWA. A service worker already exists for push; extend it for app-shell caching and add a manifest + install affordance.

## Goals
- Web app manifest (name, icons incl. existing favicon-192, theme/background color, display: standalone, start_url=/app).
- Service worker: cache the SPA app shell + static assets (Vite build hashes) for fast loads + offline shell; network-first for API, cache-first for assets. Must not break the existing push handlers.
- Install prompt / "Add to home screen" affordance in the UI.
- Push integration: keep existing subscription flow working through the SPA; deep-link notification clicks to the right SPA route (ties into epic 10).
- Lighthouse PWA pass (installable, offline-capable shell).

## Children
- Web manifest + icons + theme colors + install affordance
- Service worker app-shell caching strategy (preserve push handlers; Vite asset versioning)
- Push subscription flow in SPA + notification deep-linking to SPA routes
- PWA QA: Lighthouse/installability/offline-shell verification

Blocked by Epics 2, 6.
