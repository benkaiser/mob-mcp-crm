---
# mob-crm-64jy
title: Life events API + CRUD UI
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:24Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ruir
---

Web CRUD for contact life events.

## Design
- Internal API wrapping LifeEventsService: list (by contact), create, update, delete, restore. Fields: event_type (categorized catalog), title, description, occurred_at (approx allowed), related_contact_ids.
- UI: life events on profile (chronological) + create/edit form with event-type picker (categories) + related-contact multi-picker.

## Checklist
- [x] API list/create/update/delete/restore
- [x] Event-type catalog for picker
- [x] Profile life-events section + create/edit form
- [x] Tests: API CRUD happy+error; UI render+create
