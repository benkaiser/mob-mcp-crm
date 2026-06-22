---
# mob-crm-yafe
title: 'Epic: Web CRUD coverage — create-anywhere flows for notes/activities/reminders/tasks/gifts/debts/life-events'
status: completed
type: epic
priority: normal
created_at: 2026-05-30T14:49:34Z
updated_at: 2026-05-30T14:57:34Z
---

The web UI only exposes create for a subset of contact sub-entities (methods, addresses, custom fields, relationships, food prefs, tags) via the inline modal pattern. The right-column timeline cards on the contact profile (notes, activities, life events, reminders, open tasks, gifts, debts) have no `+ Add` affordance, so the whole CRUD group is effectively missing from the web app.

This epic restores full CRUD parity by:

1. **Profile inline editors** — adding modal create+edit editors for each of notes, activities, life events, reminders, tasks, gifts, debts; wiring them to existing `/web/api/*` endpoints; preserving the existing `Section`/`Modal` pattern so the profile stays the single editing surface.
2. **Global focused-creation pages** — new `+ New …` entries beside (not replacing) the primary `+ New contact` CTA in the sidebar AND quick actions on the dashboard, for notes, activities, reminders, tasks. Each entry navigates to a dedicated /new page whose first job is selecting the contact(s) well (1 for notes; 1–N for activities via the existing participants array; 1 for reminders/tasks).
3. **Hierarchy** — primary CTA in the sidebar remains `New contact` (gradient). All other create entries are secondary/smaller (ghost links under the CTA, or sub-nav-style rows).

## Children
- mob-crm-PROFILE-CRUD (profile inline editors)
- mob-crm-FOCUSED-PAGES (sidebar+dashboard global +New pages)