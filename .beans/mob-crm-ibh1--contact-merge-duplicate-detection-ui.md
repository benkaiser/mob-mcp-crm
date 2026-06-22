---
# mob-crm-ibh1
title: Contact merge + duplicate detection UI
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:48:34Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

Web surface for the existing contact_merge + contact_find_duplicates capabilities.

## Design
- Internal API: GET /web/api/contacts/duplicates (find likely dupes), POST /web/api/contacts/:id/merge {into_id} (merge).
- Duplicates view: list candidate pairs with match reason; "merge" action opens a confirm/compare dialog.
- Merge dialog: pick surviving record, preview merged result, confirm. Show success + link to merged contact.

## Checklist
- [x] Duplicates + merge internal API endpoints
- [x] Duplicates list UI with match reasons
- [x] Merge compare/confirm dialog
- [x] Tests: API merge happy + error; duplicates detection; UI flow render
