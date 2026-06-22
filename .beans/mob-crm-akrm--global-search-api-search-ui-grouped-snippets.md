---
# mob-crm-akrm
title: Global search API + search UI (grouped, snippets)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:14Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-2py4
---

Web surface over the existing expanded global_search (all entities).

## Design
- Internal API: GET /web/api/search?q= -> grouped results across contacts, notes, activities, life events, gifts, debts, tasks, tags with snippets.
- UI: search page + global search box in navbar (cmd/ctrl-k optional); grouped results with snippets + entity badges; keyboard navigation; click -> entity.

## Checklist
- [x] Search API wrapping global_search (grouped + snippets)
- [x] Search page + navbar search box
- [x] Grouped results + keyboard nav + navigation to entity
- [x] Tests: search API grouping/snippets happy+empty; UI render
