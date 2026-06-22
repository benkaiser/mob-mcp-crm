---
# mob-crm-ruir
title: 'Epic: Web CRUD — Interactions, life events, notes, reminders, timeline'
status: completed
type: epic
priority: high
created_at: 2026-05-29T13:45:30Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-ehb6
---

Web CRUD for the time/event-oriented entities and the unified timeline view.

## Goals
- Internal API + Preact views for activities/interactions (multi-participant), custom activity types, life events, notes (list + manage), reminders (with complete/snooze/dismiss — supersede the existing single EJS reminder page), and the unified contact timeline.
- Quick-add forms reachable from the contact profile and from global "add" actions.

## Children
- Activities internal API + list/detail/create/edit/delete (multi-contact participants)
- Custom activity types management (API + UI)
- Life events API + CRUD UI
- Notes API + list/CRUD UI (pinned ordering)
- Reminders API + CRUD UI (complete/snooze/dismiss/recurrence) — migrate existing EJS reminder page into SPA
- Contact timeline view (paginated, filter by entry type) consuming TimelineService

Blocked by Epics 1, 2, 3.
