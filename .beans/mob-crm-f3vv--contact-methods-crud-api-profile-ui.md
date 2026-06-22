---
# mob-crm-f3vv
title: Contact methods CRUD (API + profile UI)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:48:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

CRUD for a contact's contact methods (email/phone/social/website/other) on the profile.

## Design
- Internal API under /web/api/contacts/:id/methods (or /web/api/contact-methods) wrapping ContactMethodsService: add/update/remove; type enum, value, label, is_primary.
- Profile UI section: list methods grouped by type; add/edit modal; primary toggle; delete confirm. Click-to-copy / mailto/tel links.

## Checklist
- [x] API add/update/remove
- [x] Profile section list + add/edit modal + primary toggle + delete
- [x] Validation (type enum, required value)
- [x] Tests: API CRUD happy+error; UI render+add
