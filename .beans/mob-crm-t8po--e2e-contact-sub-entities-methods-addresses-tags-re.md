---
# mob-crm-t8po
title: 'E2E: Contact sub-entities (methods, addresses, tags, relationships)'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:33:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/contact-subentities.spec.ts. Owns: web/src/pages/contacts/SubEntityEditors.tsx, tests/e2e/contact-subentities.spec.ts. Add testids to sub-entity editor sections.

On a contact profile, exercise each sub-entity editor (add/edit/remove): contact methods (phone/email), addresses, custom fields, food preferences, relationships (link to another contact), tags. Verify each appears on the profile after save and is gone after delete. Seed a base contact via API fixture.

## Checklist
- [x] Contact methods add/edit/delete
- [x] Addresses add/edit/delete
- [x] Custom fields add/delete
- [x] Food preferences set/clear
- [x] Relationship link/unlink (needs 2 contacts)
- [x] Tags add/remove on contact
