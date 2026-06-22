---
# mob-crm-0tgj
title: Activities API + list/detail/create/edit/delete (multi-participant)
status: completed
type: feature
priority: high
created_at: 2026-05-29T13:49:24Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ruir
---

Web CRUD for activities/interactions, including multi-contact participants.

## Design
- Internal API wrapping ActivityService: list (filter by contact, type, date range; paginate), get, create, update, delete, restore. Participants are multiple contact IDs.
- UI: activities list (global + per-contact via profile section); create/edit form with type select, title, description, occurred_at, duration, location, participant multi-picker, optional custom activity_type.
- Show on contact profile + standalone /app/activities.

## Checklist
- [x] API list/get/create/update/delete/restore (multi-participant)
- [x] Activities list view (global) + profile section reuse
- [x] Create/edit form with participant multi-picker + type
- [x] Tests: API CRUD happy+error (incl. multi-participant); UI render+create
