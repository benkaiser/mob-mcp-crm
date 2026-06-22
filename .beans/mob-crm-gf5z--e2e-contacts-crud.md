---
# mob-crm-gf5z
title: 'E2E: Contacts CRUD'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:33:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/contacts.spec.ts. Owns: web/src/pages/contacts/ContactsList.tsx, ContactForm.tsx, ContactProfileView.tsx, tests/e2e/contacts.spec.ts. Add data-testid where rows/fields are ambiguous.

Cover the contacts CRUD centerpiece:
- Create a contact via /app/contacts/new (first/last name, etc.) → redirected to profile, fields shown.
- Contacts list shows the new contact; search/filter box narrows it; sort toggles.
- Edit the contact → changes persist on profile.
- Mark favourite / change status; verify reflected in list filters.
- Delete a contact (confirm dialog) → removed from list.
- Pagination if list helper seeds > one page (seed via API fixture).

## Checklist
- [x] Create contact → profile
- [x] List shows contact; search filter; sort
- [x] Edit persists
- [x] Favourite/status filter
- [x] Delete (confirm) removes
- [x] Pagination
