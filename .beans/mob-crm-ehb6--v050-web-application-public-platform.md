---
# mob-crm-ehb6
title: v0.5.0 — Web Application & Public Platform
status: todo
type: milestone
priority: high
created_at: 2026-05-29T13:44:52Z
updated_at: 2026-05-29T13:44:52Z
---

Transform Mob from MCP-primary to a dual-headed Personal CRM: keep MCP as the primary AI-leveraged input, and add a full web application for hands-on CRUD review/management, plus a public platform layer (REST API, tokens, webhooks) and PWA.

## Vision

One relationship engine, two front doors:
- **MCP head** (existing): conversational AI capture — the primary way data goes IN. Unchanged and remains first-class.
- **Web head** (new): hands-on review, browsing, and CRUD for everything the service layer supports.

Both heads share the same `src/services/` core. We do NOT add AI/LLM input to the web for now (no OpenRouter yet — possible future). The web is forms + lists + a rich contact profile.

## Architecture decisions (locked)

- **Frontend:** Light SPA — Preact + Vite + @preact/signals + wouter (routing). Bundle kept small; fast load; maintainable. NOT a heavy metaframework.
- **Three layers:**
  1. `src/services/*` — shared core (already exists, MCP-agnostic).
  2. **Internal JSON API** (`/web/api/*`) — session-cookie auth, ungated for free tier, consumed ONLY by the Preact SPA.
  3. **Public REST API** (`/api/v1/*`) — API-token auth, plan-gated, webhooks. Separate surface; the SPA never uses it.
- **Sessions:** move web sessions from in-memory Map to a durable `sessions` table (restart-safe, multi-instance-safe).
- **Server stack stays:** Express 5 + EJS (for the static shell/auth pages) + better-sqlite3 + zod.

## Business model (forward-looking, build the seams now)

Open-source + paid hosting. Free tier:
- Up to **11 contacts**.
- Full web UI access.
- NO public REST API / webhooks / some advanced features (gated to paid).

Build a `plan` concept + quota enforcement (contact cap) + feature-gating middleware from the start, even if everything is "unlimited/local" in self-hosted mode. Self-hosted single-user defaults to an unlimited plan.

## Scope of epics

1. Foundation — durable sessions, unified auth, plan/quota model, internal JSON API + conventions
2. Frontend foundation — Preact+Vite SPA shell, routing, auth, API client, design system
3. Web CRUD — Contacts & profile (the centerpiece + sub-entities)
4. Web CRUD — Interactions, life events, notes, reminders, timeline
5. Web CRUD — Gifts, debts, tasks, tags, food preferences
6. Web — Dashboard, global search, settings, data export/import UI
7. Public REST API + API tokens + webhooks (plan-gated)
8. Contact import (vCard / Google Contacts CSV) generalized
9. PWA — manifest, offline shell, installability, push integration
10. AI ↔ Web continuity — URL elicitation deep-links from MCP actions to web resources

## Cross-cutting requirements

- **Testing:** every internal API route and public API route gets happy-path + error/auth/quota tests using in-memory SQLite (existing pattern). Service-layer coverage stays >=90%. SPA components get lightweight tests where practical.
- **Security:** all routes scoped to the authenticated user; CSRF protection on state-changing web routes; rate-limiting on public API; no open redirects.
- **No regressions:** the 576 existing tests must keep passing; MCP behavior unchanged.
