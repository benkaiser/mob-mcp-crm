---
# mob-crm-ykvx
title: Custom fields CRUD (API + profile UI)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:48:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

CRUD for contact custom key-value fields (with optional group).

## Design
- Internal API wrapping CustomFieldsService: add/update/remove; field_name, field_value, field_group.
- Profile UI: grouped key/value list; inline add/edit/remove.

## Checklist
- [x] API add/update/remove
- [x] Profile grouped list + inline add/edit/remove
- [x] Validation (name+value required)
- [x] Tests: API CRUD happy+error; UI render+add
