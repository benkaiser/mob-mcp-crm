---
# mob-crm-2py4
title: 'Epic: Web — Dashboard, global search, settings, export/import UI'
status: completed
type: epic
priority: normal
created_at: 2026-05-29T13:45:47Z
updated_at: 2026-05-29T15:31:40Z
parent: mob-crm-ehb6
---

The connective web surfaces that aren't a single entity's CRUD: a real dashboard, global search, account/settings, and the data export + import UI.

## Goals
- Dashboard: today's reminders, upcoming birthdays, contacts needing attention, recent activity, debt summary, gift wishlist nudges, quota usage (X/11 contacts on free tier).
- Global search UI over the existing expanded global_search (all entities), with grouped results + snippets.
- Settings: profile, timezone, password change, push-notification management (migrate existing /web/notifications), API tokens entry point (links into epic 7), plan/usage display.
- Data: export (JSON download via DataExportService) + statistics view; import UI host (Monica + new importers from epic 8).

## Children
- Dashboard API aggregation endpoint + dashboard view
- Global search API + search UI (grouped, snippets, keyboard nav)
- Settings: profile/timezone/password + plan & usage display
- Settings: push notifications (migrate existing page into SPA) 
- Data export + statistics view
- Import UI host (tabs: Monica SQL, vCard, Google CSV) — wires to epic 8 importers

Blocked by Epics 1, 2.
