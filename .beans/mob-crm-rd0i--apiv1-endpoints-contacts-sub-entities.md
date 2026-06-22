---
# mob-crm-rd0i
title: /api/v1 endpoints — contacts + sub-entities
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-b6eq
---

Public REST endpoints for contacts and sub-entities over shared services.

## Endpoints
- /api/v1/contacts (list/get/create/update/delete/restore) — create honors quota.
- Sub-resources: /contacts/:id/methods, /addresses, /custom-fields, /food-preferences, /relationships, /tags (assign/unassign).
- Reuse the same services as the internal API; just a different auth + envelope surface.

## Checklist
- [x] contacts CRUD + restore (quota-aware)
- [x] methods/addresses/custom-fields/food-prefs/relationships/tags sub-resources
- [x] Scope enforcement (read/write)
- [x] Tests: each endpoint happy+error+auth+scope; quota in hosted free
