---
# mob-crm-sd98
title: Audit log + Activity Log page + Dashboard streak
status: completed
type: feature
priority: normal
created_at: 2026-08-03T00:54:51Z
updated_at: 2026-08-03T01:03:02Z
---

Add a CRUD audit log + an Activity Log page (linked from Settings) + a Dashboard streak chart.

## Part 1: Audit log (track every CRUD op; store old values for potential future restore — restore NOT required now)
- Migration `018-audit-log.sql`: create `audit_logs` (id PK, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('create','update','delete')), old_values TEXT (JSON, null for create), new_values TEXT (JSON, null for delete), created_at TEXT NOT NULL DEFAULT (datetime('now'))). Index on (user_id, created_at DESC).
- New `src/services/audit.ts` `AuditService`:
  - `record(userId, { entity_type, entity_id, action, old_values?, new_values? })` — serializes values to JSON.
  - `list(userId, { page, per_page })` → PaginatedResult of entries (newest first).
  - `getStreak(userId)` → { days: Array<{ date: 'YYYY-MM-DD', active: boolean }> for the last 7 days (oldest→newest), current_streak: number } where a day is "active" if the user has ANY audit_logs row that day, and current_streak = number of consecutive days up to and including today with at least one audit entry. Bucket days by the user's timezone (from `SettingsService.get(userId).timezone`); fall back to UTC in forgetful mode.
- Integrate audit recording into the SERVICE layer (the single choke point for both MCP tools and the web API — so instrumenting services covers both). Instrument create/update/delete (soft-deletes count as action='delete') in the primary entity services: `contacts.ts, notes.ts, activities.ts, reminders.ts, tasks.ts, debts.ts, gifts.ts, life-events.ts, relationships.ts, tags-groups.ts`, and the contact sub-entity services `contact-methods.ts, addresses.ts, custom-fields.ts, food-preferences.ts`. For updates/deletes, read the existing row first to capture old_values. Use a small shared helper to keep it DRY. Ensure the correct user_id is recorded (services keyed by contact must resolve user_id via the contact). Do NOT audit reads, imports bulk internals if noisy (use judgment — but individual entity creates during normal use should be logged), or the audit_logs table itself.
- Works in forgetful mode (audit rows live in the ephemeral cloned DB).

## Part 2: Activity Log page (linked from Settings)
- `src/server/web-api/audit-log.ts` router: `GET /` paginated list of the user's audit entries; mount at `/web/api/audit-log` in `src/server/web-api/index.ts`.
- Settings (`web/src/pages/Settings.tsx`): add an "Activity log" section with a link/button to `/app/activity-log` (follow existing Settings section patterns).
- New page `web/src/pages/AuditLog.tsx` + route `/activity-log` in `web/src/app.tsx` (register with the other top-level routes): list entries with timestamp, an action badge (create=primary/green, update=default, delete=danger), entity type, entity id (link to the entity's detail page when applicable), and a short change summary if easy. Paginated. Loading/empty/error states consistent with other pages.
- Add `AuditLogEntry` type + client in `web/src/api/`.

## Part 3: Dashboard streak
- Add streak data to the dashboard endpoint (`src/server/web-api/dashboard.ts` → extend the response; or a dedicated field) using `AuditService.getStreak(userId)`. Extend `DashboardData` type (`web/src/api/types.ts`).
- On `web/src/pages/Dashboard.tsx` add a "Streak" card: a small 7-day chart (7 cells/bars, one per day for the last 7 days, filled/highlighted when active, muted when not; label each with the weekday) AND a prominent number "N day streak" (current_streak) with a flame/label. Pure CSS — do NOT add a charting dependency. Make it look good in light and dark.

## Testing & validation
- Unit/integration: AuditService records on create/update/delete for a couple of representative entities; `list` pagination; `getStreak` (0 days, single day, a multi-day consecutive streak, a gap breaking the streak). web-api audit-log endpoint (happy + error/forgetful). Dashboard streak field present.
- e2e: Settings → Activity log page shows entries after creating something; dashboard shows the streak card. You MAY run the relevant Playwright specs (you are the only active agent).
- Run and ensure green: `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test` (vitest), `npm run build:web`.

## Conventions
TypeScript strict; service layer holds logic, web/MCP handlers are thin; migrations ordered SQL; kebab-case files, PascalCase types; conventional commits. Every new endpoint needs a happy-path + error-case test.

## Checklist
- [x] Migration 018 audit_logs + index
- [x] AuditService: record / list / getStreak (timezone-aware day bucketing)
- [x] Instrument create/update/delete across entity + sub-entity services (old_values captured)
- [x] web-api /audit-log router mounted
- [x] Settings "Activity log" section/link
- [x] AuditLog page + /activity-log route + client + types
- [x] Dashboard streak card (7-day CSS chart + current streak number)
- [x] Tests (audit service, endpoint, streak edge cases, dashboard) + e2e
- [x] typecheck + lint + vitest + build green

## Implementation notes
- Audit instrumentation is in the service layer via `recordAudit()` so MCP tools and web API mutations share the same logging path. Contact-owned sub-entities resolve `user_id` through their parent contact.
- `AuditService.getStreak()` converts each `created_at` timestamp into the user's settings timezone, returns the last seven local dates oldest→newest, and counts consecutive active local days ending today.
- Validation passed: `npm run typecheck`, `npm run lint` (0 errors, existing warnings), `npm test`, `npm run build:web`, and `npx playwright test tests/e2e/activity-log.spec.ts`.
