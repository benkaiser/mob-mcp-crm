---
# mob-crm-5pwr
title: Relationships CRUD (API + profile UI, bidirectional)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:48:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

Manage relationships between contacts from a profile, honoring bidirectional inverse creation.

## Design
- Internal API wrapping RelationshipsService: add (contact_id, related_contact_id, relationship_type, notes), update, remove, list. Inverse pair created/removed automatically by the service.
- Provide relationship type catalog endpoint (categories + types + inverses) for the picker.
- Profile UI: relationships grouped by category; add modal with contact picker + type select + notes; edit/remove. Clicking a related contact navigates to their profile.

## Checklist
- [x] API add/update/remove/list + type catalog endpoint
- [x] Profile relationships section (grouped) + add modal (contact picker + type) + edit/remove
- [x] Bidirectional behavior surfaced correctly in UI
- [x] Tests: API CRUD incl. inverse creation/removal; UI render+add
