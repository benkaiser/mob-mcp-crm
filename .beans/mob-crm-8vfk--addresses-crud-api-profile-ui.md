---
# mob-crm-8vfk
title: Addresses CRUD (API + profile UI)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:48:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

CRUD for a contact's physical addresses on the profile.

## Design
- Internal API wrapping AddressesService: add/update/remove; partial addresses allowed; is_primary; label.
- Profile UI: address cards; add/edit modal (label, lines, city, state, postal, country, primary); delete confirm; optional map link.

## Checklist
- [x] API add/update/remove
- [x] Profile address cards + add/edit modal + primary + delete
- [x] Partial-address validation
- [x] Tests: API CRUD happy+error; UI render+add
