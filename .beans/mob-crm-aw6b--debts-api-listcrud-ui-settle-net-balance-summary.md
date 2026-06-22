---
# mob-crm-aw6b
title: Debts API + list/CRUD UI (settle + net balance summary)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:44Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-fhko
---

Web CRUD for debts with per-contact and global net-balance summaries.

## Design
- Internal API wrapping DebtService: list (by contact/status), create, update, settle, delete, restore, summary (per-contact net + global net).
- Fields: amount, currency, direction (i_owe_them/they_owe_me), reason, incurred_at, settled_at, status.
- UI: debts list with active/settled filter + per-contact section showing net balance; create/edit form; settle action; global "who owes whom" summary; currency formatting.

## Checklist
- [x] API list/create/update/settle/delete/restore/summary
- [x] Debts list + per-contact net balance + global summary
- [x] Create/edit form + settle action
- [x] Currency formatting
- [x] Tests: API CRUD+net-balance happy+error; UI render+create+settle
