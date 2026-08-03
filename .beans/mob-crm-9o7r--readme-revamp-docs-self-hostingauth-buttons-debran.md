---
# mob-crm-9o7r
title: README revamp + docs self-hosting/auth buttons + debrand kangaroo + link Public API
status: completed
type: task
priority: normal
created_at: 2026-08-03T01:12:56Z
updated_at: 2026-08-03T01:15:17Z
---

Marketing/branding polish: README revision, docs self-hosting + auth buttons, remove kangaroo emoji, link Public API to docs.

## 1. README.md — high-level rewrite (currently ~167 lines, way too specific/implementation-detailed)
- Replace the 🦘 kangaroo emoji in the title with the app icon SVG (GitHub renders relative image paths): e.g. `<img src="web/public/icons/icon.svg" width="80" alt="Mob">` in the heading.
- Rewrite to be high-level and SELL the idea: Mob is an AI-first personal CRM you use through natural language via MCP. Keep it concise — value prop, key capabilities at a high level (not exhaustive field lists), screenshots/links. Remove overly specific implementation detail.
- Add prominent links:
  - Try the live demo: https://demo.mobcrm.au/app/
  - Sign up (free while in beta): https://mobcrm.au/auth/register?from=web
- Self-hosting: keep only a MINIMAL mention in the README and link to the new self-hosting section in the docs site (see part 2) rather than full instructions.
- Keep a short "open source / license / support (mobsupport@benkaiser.dev)" note. Keep it tasteful and skimmable.

## 2. Docs site additions (docs-site/ + scripts/build-docs.mjs + docs.css)
- Add a **Self-hosting** docs page (`docs-site/self-hosting.md`) and register it in the nav in `scripts/build-docs.mjs` (the `pages` array ~line 14). Move the (previously minimal in README) self-hosting instructions here and expand appropriately: prerequisites (Node 20+), install, env vars (MOB_DATA_DIR, SMTP_* for email, ENV, base URL), running persistent vs `--forgetful` mode, building, and deployment notes. Base it on the actual code/README/AGENTS.md.
- In the docs HTML layout header (`build-docs.mjs`, around the header links ~lines 61-63 which currently have Home `/`, Open app `/app/`, REST reference), make sure it links back to the MAIN SITE (Home → `/` which is mobcrm.au) AND add a clear **Sign in** and **Sign up** button:
  - Sign in → `/app/` (or the login route) 
  - Sign up → `/auth/register?from=web`
  Style them as buttons in `docs.css` (light/dark aware), visible in the docs header.

## 3. Remove the kangaroo emoji from the sign-up page
- `src/server/views/_auth-layout.ejs` line 14: `<h1>&#x1F998; Mob</h1>` — replace the kangaroo entity with the app icon SVG for brand consistency (mirror the homepage: `<img class="brand-logo" src="/app/icons/icon.svg" alt="" width="22" height="22"> Mob`), or a clean logo lockup. This layout is used by register/login/forgot/reset — verify it looks right on the sign-up page.

## 4. Settings: link "Public API" to the docs
- `web/src/pages/Settings.tsx` line ~64: `<dt>Public API</dt>` — make the "Public API" text a link to the API docs page `/docs/api`, opening in a NEW TAB (`target="_blank" rel="noopener noreferrer"`). Keep the existing enabled/unavailable badge.

## Validation
- `npm run build` (incl. docs) succeeds; `/docs/self-hosting` renders; docs header shows Sign in/Sign up + Home. README renders (spot-check markdown). 
- `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test` (vitest).

## Checklist
- [x] README rewritten (high-level, app icon SVG, demo + signup links, minimal self-hosting → docs link)
- [x] docs-site/self-hosting.md added + in nav
- [x] docs header: main-site link + Sign in/Sign up buttons (styled)
- [x] _auth-layout.ejs kangaroo → app icon SVG
- [x] Settings "Public API" links to /docs/api in new tab
- [x] typecheck + lint + vitest + build green
