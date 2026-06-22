---
# mob-crm-a2co
title: /api/v1 endpoints — gifts, debts, tasks, tags, search, export
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-b6eq
---

Public REST endpoints for remaining entities + search + export.

## Endpoints
- /api/v1/gifts (CRUD + stats)
- /api/v1/debts (CRUD + settle + summary)
- /api/v1/tasks (CRUD + complete)
- /api/v1/tags (CRUD)
- /api/v1/search (global_search)
- /api/v1/export (full JSON export), /api/v1/statistics

## Checklist
- [x] gifts (+stats)
- [x] debts (+settle/summary)
- [x] tasks (+complete)
- [x] tags
- [x] search + export + statistics
- [x] Tests: each endpoint happy+error+auth+scope
