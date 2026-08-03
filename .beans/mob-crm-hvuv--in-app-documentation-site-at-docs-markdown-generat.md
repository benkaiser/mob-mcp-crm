---
# mob-crm-hvuv
title: In-app documentation site at /docs (markdown-generated, unauthenticated)
status: completed
type: feature
priority: normal
created_at: 2026-08-03T01:01:58Z
updated_at: 2026-08-03T01:09:42Z
---

Add an unauthenticated documentation site at `/docs/`, generated from raw markdown at build time (not stored as hand-written HTML), styled to fit the app and light/dark aware.

## Serving (unauthenticated)
- Serve at `/docs` at the Express app level in `src/server/http-server.ts` (public pages like the homepage/login are already served here without auth; the only auth is on `/web/api` and MCP). Use `express.static` over the generated docs output dir, with an index page at `/docs` and `/docs/`. Probe both dev and bundle locations for the output dir (mirror how the SPA `webDir` is resolved ~line 787). Ensure it works with `npm run dev` AND `npm start` (built).
- Add a link to `/docs` from the homepage (`src/server/views/homepage.ejs`) and from the app sidebar footer (`web/src/components/AppShell.tsx`) so it's discoverable.

## Build-time generation from markdown
- Author docs as markdown in a new `docs-site/` directory (keep separate from the agent-facing `docs/FEATURES.md`). Suggested files: `index.md`, `usage.md`, `api.md`, `mcp.md`.
- Add a build script (e.g. `scripts/build-docs.mjs`) that converts each `.md` → a standalone HTML page using a markdown library (add `marked` — a small, well-known MIT lib — as a dependency), wrapped in a shared HTML layout with a left nav linking the pages, a small self-contained stylesheet (`docs.css`) that respects light/dark (prefers-color-scheme or a toggle), syntax-friendly `<pre>` styling, and the Mob branding. Output to a docs dist dir served by the static route.
- Wire it into the build: add an `npm run build:docs` script and include it in `npm run build`; also copy/generate into `dist/` for production (extend `tsup.config.ts` onSuccess or the build script so `npm start` serves docs). Keep dev working (generate on demand or have the script runnable standalone; document how).

## Content (accurate to the CURRENT app — audit the code)
1. `usage.md`: general usage of the app + an explanation of EACH data type stored: contacts (+ profile fields), notes, activities (interaction types), reminders (frequency/status), tasks, debts, gifts, life events, relationships (+ inverse types), tags, custom fields, addresses, contact methods, food preferences. Use `docs/FEATURES.md` as the source of truth; keep it user-facing.
2. `api.md`: REST/API documentation AND an AUDIT of the current API surface that MAPS each capability across the three interfaces: the internal web API (`src/server/web-api/*` mounted at `/web/api`), the public REST API (`src/server/public-api/*`, `openapi.ts`), and MCP tools (`src/server/mcp-server.ts`). Produce a table mapping: UI action ⇄ MCP tool ⇄ REST endpoint, for every entity/capability. Call out anything available in one interface but not another. IMPORTANT: this bean runs AFTER the audit-log feature lands, so INCLUDE the new `/web/api/audit-log` endpoint and dashboard streak, plus tags management, relationship types, favorites, etc.
3. `mcp.md`: how to configure/connect the MCP server (Streamable HTTP transport at `/mcp`, OAuth 2.0 PKCE flow, pointing MCP clients at the server URL), and a HIGH-LEVEL explanation of how the MCP server is designed to minimize context usage: the `prime` tool (see `src/server/prompts.ts` / the prime tool registration) that bootstraps the agent, plus consolidated bulk "manage" tools (e.g. `relationship_manage` with action add/update/remove/list, and other `*_manage`/bulk tools) instead of many fine-grained tools. Audit `src/server/mcp-server.ts` for the actual tool list and describe the pattern.

## Validation
- `npm run build` (incl. docs) succeeds; `/docs`, `/docs/usage`, `/docs/api`, `/docs/mcp` load unauthenticated (verify no auth redirect) and render styled HTML. Add a small integration/e2e check that `GET /docs` returns 200 HTML without auth.
- `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test`.

## Checklist
- [x] Add `marked`; scripts/build-docs.mjs generating HTML from docs-site/*.md with shared layout + docs.css (light/dark)
- [x] Wire into npm build + tsup onSuccess/dist so `npm start` serves docs; keep dev working
- [x] Serve /docs unauthenticated in http-server.ts (dev+bundle path probing)
- [x] Links from homepage + app sidebar
- [x] usage.md (all data types)
- [x] api.md (surface audit table: UI ⇄ MCP ⇄ REST, incl. audit-log/streak/tags/rel-types)
- [x] mcp.md (config + prime/manage-tools architecture)
- [x] /docs 200 unauth test; typecheck + lint + vitest + build green
