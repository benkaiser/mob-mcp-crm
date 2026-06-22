---
# mob-crm-c8uk
title: Gifts API + list/CRUD UI (lifecycle + wishlist + stats)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:44Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-fhko
---

Web CRUD for gifts with lifecycle and wishlist/tracker.

## Design
- Internal API wrapping GiftService: list (filter by contact, status, direction, occasion; tracker stats), create, update, delete, restore.
- Fields: name, description, url, estimated_cost, currency, occasion, status (idea/planned/purchased/given/received), date, direction (giving/receiving).
- UI: gifts list with status filter + per-contact section; create/edit form; status transition actions; wishlist/idea-bank view; tracker stats panel; currency formatting.

## Checklist
- [x] API list/create/update/delete/restore + stats
- [x] Gifts list (filters) + per-contact section + wishlist view
- [x] Create/edit form + status transitions
- [x] Currency formatting
- [x] Tests: API CRUD+stats happy+error; UI render+create
