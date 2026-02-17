---
# mob-crm-n0pc
title: Add activity_type_update and activity_type_delete tools
status: completed
type: feature
priority: normal
created_at: 2026-02-17T13:28:55Z
updated_at: 2026-02-17T14:15:42Z
parent: mob-crm-6zu2
---

Activity types can be created and listed, but never updated or deleted. This is a CRUD gap.

## Design

### Tools to add:
- `activity_type_update` — update an activity type's name, icon, or description
- `activity_type_delete` — delete an activity type (hard delete, since activity_types don't have a deleted_at column). Should check if any activities reference this type and either prevent deletion or reassign them.

### Implementation notes:
- The `activity_types` table has columns: id, user_id, name, icon, created_at, updated_at
- Activities reference types by the `type` string field (not a FK to activity_types.id), so deletion is safe from a FK perspective but may leave orphaned type references in activities
- On delete, consider: (a) prevent if activities use this type, (b) allow but warn, or (c) allow and update activities to a default type. Option (b) is simplest and most LLM-friendly — return a warning with the count of activities using this type.
- Verify user_id ownership on both update and delete

### Files to modify:
- `src/services/activities.ts` — add `updateActivityType(userId, typeId, input)` and `deleteActivityType(userId, typeId)` methods
- `src/server/mcp-server.ts` — register both tools

### Test files to modify:
- `tests/integration/activities.test.ts` — add tests for activity type CRUD

## Checklist
- [x] Add `updateActivityType()` method to ActivityService
- [x] Add `deleteActivityType()` method to ActivityService with usage check
- [x] Register `activity_type_update` tool in mcp-server.ts
- [x] Register `activity_type_delete` tool in mcp-server.ts
- [x] Add integration tests for activity type update and delete