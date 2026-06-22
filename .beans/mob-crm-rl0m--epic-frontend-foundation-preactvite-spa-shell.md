---
# mob-crm-rl0m
title: 'Epic: Frontend foundation — Preact+Vite SPA shell'
status: completed
type: epic
priority: high
created_at: 2026-05-29T13:45:11Z
updated_at: 2026-05-29T15:02:05Z
parent: mob-crm-ehb6
---

Stand up the light SPA: Preact + Vite + @preact/signals + wouter, served by the existing Express app, consuming the internal JSON API. Keep it small and fast.

## Goals
- Vite build pipeline integrated with the existing tsup/Express build & dev flow.
- App shell: served at `/app/*` (SPA fallback), EJS still serves auth/landing pages.
- Routing (wouter), auth guard (redirect to /web/login if no session), typed API client wrapping `/web/api/*`.
- Shared design system: minimal CSS (reuse existing color tokens from _head.ejs), layout, navbar, toasts, form primitives, loading/empty/error states.
- Build output goes to dist and is served with proper caching; dev mode uses Vite middleware/HMR.

## Children
- Vite + Preact build pipeline & dev integration
- App shell, routing, auth guard
- Typed API client + signals-based data/store layer
- Design system / shared UI components (forms, tables, modals, toasts, pagination)

Blocked by Epic 1 (needs internal API conventions). Blocks epics 3-6, 9.
