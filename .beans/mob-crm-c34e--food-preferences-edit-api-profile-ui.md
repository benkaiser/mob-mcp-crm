---
# mob-crm-c34e
title: Food preferences edit (API + profile UI)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:48:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

View/edit a contact's food preferences.

## Design
- Internal API wrapping FoodPreferencesService: get + upsert (dietary_restrictions[], allergies[], favorite_foods[], disliked_foods[], notes).
- Profile UI: tag-input arrays for each list + notes textarea; single save (upsert).

## Checklist
- [x] API get + upsert
- [x] Profile editor (tag inputs + notes)
- [x] Tests: API get/upsert happy+error; UI render+save
