---
# mob-crm-2l1l
title: Reminders API + CRUD UI (migrate existing EJS reminder page)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:24Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ruir
---

Web CRUD for reminders, superseding the current single-purpose EJS reminder page with full SPA management.

## Design
- Internal API wrapping ReminderService: list (active/overdue/upcoming, by contact, paginate), create, update, complete, snooze, dismiss(delete), restore. Honor frequency (one_time/weekly/monthly/yearly) + recurrence advancement + auto-generated birthday reminders (read-only origin).
- UI: reminders list (overdue/today/upcoming groupings) + per-contact section; create/edit form (title, description, date, frequency, contact); actions complete/snooze(+days)/dismiss.
- Migrate the existing /web/reminder/:id behavior into the SPA; keep deep-link compatibility (push notifications link to /web/reminder/:id -> redirect to /app/reminders/:id) so existing notifications still work.

## Checklist
- [x] API list/create/update/complete/snooze/delete/restore
- [x] Reminders list (grouped) + per-contact section
- [x] Create/edit form + complete/snooze/dismiss actions
- [x] Backward-compatible redirect from old /web/reminder/:id to SPA route
- [x] Tests: API actions + recurrence advancement happy+error; redirect compat; UI render+create
