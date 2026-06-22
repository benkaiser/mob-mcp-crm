---
# mob-crm-twgw
title: Contact timeline view (paginated, filter by type)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:49:24Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ruir
---

Unified per-contact timeline aggregating activities, life events, notes, reminders, gifts, debts, relationship changes, contact created — newest first.

## Design
- Internal API wrapping TimelineService: GET /web/api/contacts/:id/timeline?type=&page= -> paginated entries with source type, date, summary, link to source.
- UI: vertical timeline on profile (or dedicated tab) with type filter chips + pagination/infinite scroll; each entry links to the underlying record.

## Checklist
- [x] Timeline API (paginated + type filter) wrapping TimelineService
- [x] Timeline UI (filter chips + pagination) on profile
- [x] Entry -> source navigation
- [x] Tests: API aggregation+filter+pagination; UI render
