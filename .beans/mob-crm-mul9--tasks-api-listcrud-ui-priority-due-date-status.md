---
# mob-crm-mul9
title: Tasks API + list/CRUD UI (priority, due date, status)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:44Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-fhko
---

Web CRUD for tasks, optionally contact-linked.

## Design
- Internal API wrapping TaskService: list (by contact, status, overdue, priority; paginate), create, update, complete, delete, restore.
- Fields: contact_id?, title, description, due_date, priority (low/medium/high), status (pending/in_progress/completed), completed_at.
- UI: tasks list (filters: open/overdue/by-contact/priority) + per-contact section; create/edit form; complete toggle; overdue highlighting.

## Checklist
- [x] API list/create/update/complete/delete/restore
- [x] Tasks list (filters) + per-contact section
- [x] Create/edit form + complete toggle + overdue highlight
- [x] Tests: API CRUD+status transitions happy+error; UI render+create+complete
