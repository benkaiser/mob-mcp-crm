---
# mob-crm-qmfh
title: /api/v1 endpoints — activities, life events, notes, reminders, timeline
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-b6eq
---

Public REST endpoints for the time/event entities.

## Endpoints
- /api/v1/activities (CRUD + restore, multi-participant), /activity-types
- /api/v1/life-events (CRUD)
- /api/v1/notes (CRUD + search)
- /api/v1/reminders (CRUD + complete/snooze)
- /api/v1/contacts/:id/timeline

## Checklist
- [x] activities + activity-types
- [x] life-events
- [x] notes (+search)
- [x] reminders (+complete/snooze)
- [x] timeline
- [x] Tests: each endpoint happy+error+auth+scope
