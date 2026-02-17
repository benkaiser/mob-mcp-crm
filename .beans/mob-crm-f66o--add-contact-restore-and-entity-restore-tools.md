---
# mob-crm-f66o
title: Add contact_restore and entity restore tools
status: completed
type: feature
priority: high
created_at: 2026-02-17T13:28:32Z
updated_at: 2026-02-17T13:51:24Z
parent: mob-crm-6zu2
---

Contacts and other entities (notes, activities, life events, reminders, gifts, debts, tasks) are soft-deleted but there's no way to un-delete them. An LLM can accidentally delete something and has no way to undo it.

## Design

Add a `restore` method to each service that has a `softDelete` method. The restore operation simply sets `deleted_at = NULL` on the record.

### Tools to add:
- `contact_restore` — restore a soft-deleted contact by ID
- `note_restore` — restore a soft-deleted note by ID
- `activity_restore` — restore a soft-deleted activity by ID
- `life_event_restore` — restore a soft-deleted life event by ID
- `reminder_restore` — restore a soft-deleted reminder by ID
- `gift_restore` — restore a soft-deleted gift by ID
- `debt_restore` — restore a soft-deleted debt by ID
- `task_restore` — restore a soft-deleted task by ID

### Implementation notes:
- Each restore method should verify ownership (user_id or contact ownership)
- The restore should only work on records where `deleted_at IS NOT NULL`
- Return the restored record, or an error if not found or not deleted
- Consider adding a `contact_list_deleted` tool (and similar for other entities) so the LLM can discover what was deleted. Alternatively, add an `include_deleted` option to existing list tools.

### Files to modify:
- `src/services/contacts.ts` — add `restore(userId, contactId)` method
- `src/services/notes.ts` — add `restore(userId, noteId)` method
- `src/services/activities.ts` — add `restore(userId, activityId)` method
- `src/services/life-events.ts` — add `restore(userId, lifeEventId)` method
- `src/services/reminders.ts` — add `restore(userId, reminderId)` method
- `src/services/gifts.ts` — add `restore(userId, giftId)` method
- `src/services/debts.ts` — add `restore(userId, debtId)` method
- `src/services/tasks.ts` — add `restore(userId, taskId)` method
- `src/server/mcp-server.ts` — register all 8 restore tools
- Add `include_deleted` boolean option to list tools where relevant

### Test files to create/modify:
- Add restore tests to each entity's existing integration test file

## Checklist
- [x] Add `restore()` method to ContactService
- [x] Add `restore()` method to NoteService
- [x] Add `restore()` method to ActivityService
- [x] Add `restore()` method to LifeEventService
- [x] Add `restore()` method to ReminderService
- [x] Add `restore()` method to GiftService
- [x] Add `restore()` method to DebtService
- [x] Add `restore()` method to TaskService
- [x] Register all 8 restore tools in mcp-server.ts
- [x] Add `include_deleted` option to contact_list and other list tools
- [x] Add integration tests for all restore operations