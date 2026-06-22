---
# mob-crm-ojgb
title: 'E2E: Timeline entities (activities, notes, reminders, gifts, debts, tasks, life events)'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:33:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/timeline-entities.spec.ts. Owns: web/src/pages/EntityDetail.tsx, tests/e2e/timeline-entities.spec.ts. Add testids to EntityDetail + timeline UI on the profile.

Cover timeline entities reachable from a contact profile and their detail pages (/app/<resource>/:id): activities, notes, life-events, reminders, gifts, debts, tasks. For each: create it (via UI on the profile or via API seed), see it on the contact timeline, open its EntityDetail page, edit a field, delete it. Reminder complete/snooze if exposed in SPA.

## Checklist
- [x] Activity create/view/edit/delete
- [x] Note create/view/delete
- [x] Life event create/view/delete
- [x] Reminder create/view/complete
- [x] Gift create/view/delete
- [x] Debt create/view/delete
- [x] Task create/view/complete
