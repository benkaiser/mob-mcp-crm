---
# mob-crm-le2t
title: Notes API + list/CRUD UI (pinned ordering)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:24Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ruir
---

Web CRUD for notes (per-contact and listable), preserving pinned-first ordering.

## Design
- Internal API wrapping NotesService: list/search (by contact, tag, pinned, pagination), create, update, delete, restore. Fields: title?, body (markdown), is_pinned.
- UI: notes on profile (pinned first, reverse-chronological) + standalone notes list/search; create/edit with markdown body + pin toggle; render markdown safely.

## Checklist
- [x] API list/search/create/update/delete/restore
- [x] Profile notes section (pinned first) + standalone list/search
- [x] Create/edit with markdown + pin toggle + safe render
- [x] Tests: API CRUD+pin ordering happy+error; UI render+create
