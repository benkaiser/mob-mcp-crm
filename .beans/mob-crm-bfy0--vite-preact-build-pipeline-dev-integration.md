---
# mob-crm-bfy0
title: Vite + Preact build pipeline & dev integration
status: completed
type: task
priority: high
created_at: 2026-05-29T13:47:58Z
updated_at: 2026-05-29T15:02:05Z
parent: mob-crm-rl0m
---

Add the Vite + Preact + TypeScript build, integrated with the existing tsup/Express setup, kept light.

## Design
- Add deps: preact, @preact/signals, wouter; dev: vite, @preact/preset-vite.
- Frontend source under `web/` (or `src/web-app/`) — decide and document; keep separate from server `src/`.
- `vite.config.ts`: build to `dist/app/` with hashed assets; base `/app/`.
- Express serves built assets from dist/app with long cache + SPA fallback to index.html for `/app/*`.
- Dev mode: run Vite dev server with HMR; proxy `/web/api`, `/api`, `/auth`, `/mcp` to Express (or run Express as middleware). Document `npm run dev` story so both server + SPA reload.
- package.json scripts: `dev` (concurrent server+vite), `build` (tsup + vite build), ensure `start` serves built SPA.
- Keep bundle small: no UI kit; track gzipped size budget (~<40kb app code target) and note it.

## Checklist
- [x] Install preact/signals/wouter/vite/preset
- [x] Frontend dir + tsconfig for web app
- [x] vite.config.ts (base /app/, hashed output to dist/app)
- [x] Express SPA fallback + static serving for /app
- [x] Dev: concurrent server+vite with API proxy + HMR
- [x] Updated npm scripts (dev/build/start)
- [x] Smoke test: built /app loads a placeholder Preact page; production serve works
