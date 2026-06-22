---
# mob-crm-axhy
title: Tags assign/unassign on contact (API + profile UI)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:48:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

Tag/untag a contact from the profile (full tag management lives in epic 5).

## Design
- Internal API wrapping tags-groups service: list tags, tag_contact, untag_contact; create-on-the-fly when tagging with a new name.
- Profile UI: tag chips with remove (x); add via tag-input with autocomplete from existing tags + create new; color shown.

## Checklist
- [x] API list + tag_contact + untag_contact (+ create-on-fly)
- [x] Profile tag chips + add (autocomplete + create) + remove
- [x] Tests: API tag/untag happy+error; UI render+add+remove
