---
# mob-crm-0gqm
title: Contact list view (filters, sorts, pagination, search)
status: completed
type: feature
priority: high
created_at: 2026-05-29T13:48:34Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

Preact view for browsing contacts.

## Design
- Responsive list/grid of contacts: avatar/initials, name, company/job, tags, next birthday, last-interaction hint, favorite star.
- Filter controls: tag, status (active/archived/deceased), favorite-only, company, location, upcoming-birthday window, needs-attention. Sort dropdown. Search box (debounced) hitting list endpoint.
- Pagination control. Empty state ("No contacts yet — add one or import"). Loading/error states.
- "Add contact" button -> create form. Click row -> profile.
- On hosted free tier, show usage chip (X/11) and disable add with upgrade hint when at cap.

## Checklist
- [x] List/grid rendering with key fields
- [x] Filters + sort + debounced search wired to API
- [x] Pagination
- [x] Empty/loading/error states
- [x] Add button + quota-aware disable on free tier
- [x] Test: renders list, applies filter, paginates
