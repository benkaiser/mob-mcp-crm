---
# mob-crm-swyj
title: PWA install icon fails to load (svg) — use PNG icons in manifest
status: completed
type: bug
priority: normal
created_at: 2026-08-03T00:26:33Z
updated_at: 2026-08-03T00:28:22Z
---

Chrome logs `Icon http://localhost:3000/app/icons/icon.svg failed to load` and the PWA install icon doesn't load on desktop.

## Diagnosis
- `web/public/manifest.webmanifest` lists icons including an SVG entry `{"src":"/app/icons/icon.svg","sizes":"any","type":"image/svg+xml","purpose":"any"}` PLUS valid PNGs (icon-192.png, icon-512.png any; icon-maskable-512.png maskable). All files exist in `web/public/icons/` and are served (dist-web is served at /app via express.static in `src/server/http-server.ts` ~791, which sets correct MIME for .svg). So it's not a 404/MIME/serving problem.
- Chrome fails to DECODE the large (viewBox 0 0 2048 2048, ~22KB) SVG as a manifest install icon and logs "failed to load". Chrome install prompts want raster PNG icons anyway.

## Fix
- Remove the SVG entry from the manifest `icons` array (keep the three PNGs). Ensure the PNG set is a valid PWA icon set: at least a 192x192 and 512x512 `purpose:"any"`, plus a maskable 512 (already present). Consider adding a maskable 192 if easy, but not required.
- Keep the in-page favicon `<link rel="icon" type="image/svg+xml" href="/app/icons/icon.svg">` (index.html line 10, `src/server/views/_head.ejs` line 4) — that SVG favicon works in-page and is separate from the PWA install icon. Optionally ALSO add a PNG favicon fallback `<link rel="icon" type="image/png" sizes="192x192" href="/app/icons/icon-192.png">` for browsers that don't support SVG favicons, but do not remove the SVG favicon.
- Do NOT break the apple-touch-icon (already PNG).
- Verify the manifest still validates and that installability isn't regressed.

## Investigate/confirm
- Confirm the PNG icons render correctly (open the files) and are the intended Mob logo.
- Check `web/index.html`, `src/server/views/_head.ejs`, `src/server/views/homepage.ejs`, and `web/src/sw-app.ts` / `web/public/manifest.webmanifest` for any other reference to icon.svg as a PWA/app icon and adjust as needed.
- If there is a PWA/installability e2e or unit test (search tests/ for manifest/icon), update it. WRITE/adjust specs but DO NOT run Playwright (orchestrator runs e2e later).

## Checklist
- [x] Remove SVG entry from manifest icons (keep PNGs)
- [x] Ensure valid PNG icon set (192 any, 512 any, 512 maskable)
- [x] Optional PNG favicon fallback in index.html/_head.ejs (keep SVG favicon)
- [x] Confirm no remaining broken PWA icon reference
- [x] Update/add manifest/icon test if present
- [x] typecheck + lint + vitest green
