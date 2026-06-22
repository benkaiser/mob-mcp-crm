---
# mob-crm-sice
title: Tags management API + UI (list/create/update/delete/color)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:44Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-fhko
---

Global tag management (assignment-on-contact lives in epic 3).

## Design
- Internal API wrapping tags-groups service: list (with tagged-contact counts), create, update (name/color), delete.
- UI: tags management page: list with color swatch + contact count; create/edit (name + color picker); delete (confirm; warn about untagging). Click a tag -> contacts filtered by that tag.

## Checklist
- [x] API list(+counts)/create/update/delete
- [x] Tags management page (list + color + counts)
- [x] Create/edit (color picker) + delete confirm
- [x] Tag -> filtered contacts navigation
- [x] Tests: API CRUD happy+error; UI render+create+delete
