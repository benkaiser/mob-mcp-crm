---
# mob-crm-q3hd
title: Custom activity types management (API + UI)
status: completed
type: feature
priority: low
created_at: 2026-05-29T13:49:24Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ruir
---

Manage user-defined activity types (name, category, icon) used to categorize activities.

## Design
- Internal API wrapping activity type service: list/create/update/delete.
- UI: simple management list (likely under settings or activities) with add/edit/delete; emoji/icon + category. Used by the activity create form's type picker.

## Checklist
- [x] API list/create/update/delete
- [x] Management UI (list + add/edit/delete)
- [x] Tests: API CRUD happy+error; UI render+add
