---
# mob-crm-8xz9
title: Contacts internal API (list/get/create/update/delete/restore)
status: completed
type: feature
priority: high
created_at: 2026-05-29T13:48:34Z
updated_at: 2026-05-29T14:21:29Z
parent: mob-crm-gusl
---

Internal JSON API endpoints for core contact operations, wrapping ContactService.

## Endpoints (/web/api/contacts)
- GET / — list with filters (tag, status, favorite, company, location, upcoming birthday window, needs-attention, search) + sort (name, last_interaction, date_added, upcoming_birthday) + pagination.
- GET /:id — enriched contact (reuse ContactService.get full payload: methods, addresses, food prefs, custom fields, relationships, tags, notes, activities, life events, reminders, tasks, gifts, debts, debt summary).
- POST / — create (zod-validated; birthday modes); enforceContactQuota first.
- PATCH /:id — update.
- DELETE /:id — soft delete.
- POST /:id/restore — restore.

## Checklist
- [x] List endpoint w/ all filters+sorts+pagination mapped to ListContactsOptions
- [x] Get endpoint returning enriched payload
- [x] Create (zod + quota enforcement + 402/403 on cap)
- [x] Update (partial)
- [x] Delete (soft) + Restore
- [x] Tests: each endpoint happy + error (404, validation, unauthorized, quota-exceeded in hosted free mode)
