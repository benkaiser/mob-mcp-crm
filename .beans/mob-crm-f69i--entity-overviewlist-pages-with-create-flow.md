---
# mob-crm-f69i
title: Entity overview/list pages with create flow
status: completed
type: feature
priority: normal
created_at: 2026-08-03T00:00:27Z
updated_at: 2026-08-03T00:05:12Z
---

Add overview (list) pages for each timeline entity type — Activities, Notes, Reminders, Tasks, Debts, Gifts — so dashboard tiles/items can link to them, with support for creating new ones. Reuse the excellent ContactPicker-led creation UX from the '+ New' pages.

## Background
- List GET endpoints already exist in web-api for each: `src/server/web-api/{activities,notes,reminders,tasks,debts,gifts}.ts` all have `router.get('/')`.
- Detail pages already exist via `EntityDetail` at routes /activities/:id etc. (`web/src/app.tsx`).
- The '+ New' creation pages live in `web/src/pages/quickCreate.tsx` and lead with `ContactPicker` (from `web/src/components/ContactPicker.tsx`) — this is the 'awesome contact search' the user wants reused. Existing: NewNotePage, NewActivityPage, NewReminderPage, NewTaskPage. **Missing: gifts and debts have no '+ New' page** (currently created only via contact profile SubEntityEditors GiftEditor/DebtEditor).
- Dashboard (`web/src/pages/Dashboard.tsx`) has CountTiles (Activities, Reminders, etc.) and recent lists — these should hyperlink to the new overview pages.
- Sidebar nav is in `web/src/components/AppShell.tsx`.

## Requirements
1. Overview/list pages at routes /activities, /notes, /reminders, /tasks, /debts, /gifts (register BEFORE the /:id routes in app.tsx, and after the /new routes). Consider a single reusable list-page component driven by a per-entity config (endpoint, columns/row renderer, icon, label, new-route).
2. Each row links to that entity's EntityDetail page. Each overview page has a prominent 'New <Entity>' action reusing the ContactPicker-led create flow.
3. Add NewGiftPage and NewDebtPage to quickCreate.tsx (ContactPicker single-select + entity fields) and register their /gifts/new, /debts/new routes.
4. Hyperlink the Dashboard count tiles (and section headers) to the corresponding overview pages. Add sidebar nav entries for the overviews.
5. Empty states, loading spinner, error handling consistent with existing pages.

## Checklist
- [x] Reusable overview/list page component + per-entity config
- [x] Routes for /activities /notes /reminders /tasks /debts /gifts overviews
- [x] NewGiftPage + NewDebtPage (ContactPicker-led) + routes
- [x] Dashboard tiles/section links to overviews
- [x] Sidebar nav entries
- [x] e2e specs (write; do not run playwright — orchestrator runs e2e)
- [x] typecheck + lint + vitest green