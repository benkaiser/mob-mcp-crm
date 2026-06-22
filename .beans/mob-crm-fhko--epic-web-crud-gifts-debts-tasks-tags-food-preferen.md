---
# mob-crm-fhko
title: 'Epic: Web CRUD — Gifts, debts, tasks, tags, food preferences'
status: completed
type: epic
priority: normal
created_at: 2026-05-29T13:45:47Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ehb6
---

Web CRUD for the remaining entities so the web reaches full parity with the MCP tool surface.

## Goals
- Internal API + Preact views for gifts (lifecycle + tracker stats), debts (with per-contact + global summary/net balance), tasks (optionally contact-linked, status transitions), tags (manage + color), and food preferences (covered on profile in epic 3 but ensure a standalone manage path too).

## Children
- Gifts API + list/CRUD UI (idea→planned→purchased→given/received; wishlist view; stats)
- Debts API + list/CRUD UI (direction, settle, per-contact + global net balance summary)
- Tasks API + list/CRUD UI (priority, due date, status; filter by contact / open / overdue)
- Tags management API + UI (list/create/update/delete/color; show tagged-contact counts)

Blocked by Epics 1, 2, 3.
