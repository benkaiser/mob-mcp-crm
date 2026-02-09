---
# mob-crm-e3e5
title: Reminders
status: completed
type: epic
priority: normal
created_at: 2026-02-09T00:06:09Z
updated_at: 2026-02-09T00:49:09Z
parent: mob-crm-d92t
---

Implement the reminder system.

## Scope
- Reminders table migration
- Reminder service: create, get, update, soft-delete, list, complete, snooze
- Frequency options: one_time, weekly, monthly, yearly
- Auto-generated birthday reminders (created/removed when birthday is set/unset)
- Recurring reminder date advancement on acknowledgment
- Query for overdue and upcoming reminders within a time window
- Status: active, snoozed, completed, dismissed
- MCP tools: reminder_list, reminder_create, reminder_update, reminder_complete, reminder_snooze, reminder_delete
- Integration tests including recurrence and auto-birthday