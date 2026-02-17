---
# mob-crm-0qc8
title: Add bulk/batch operations for contacts and related entities
status: completed
type: feature
priority: normal
created_at: 2026-02-17T13:28:39Z
updated_at: 2026-02-17T14:15:42Z
parent: mob-crm-6zu2
---

Every mutation is one-at-a-time. An LLM importing from a conversation like "I met Sarah, Mike, and Lisa at the conference" must make 3 separate contact_create calls, then 3 contact_tag calls, then 3 activity_create calls. A batch endpoint would dramatically reduce round-trips.

## Design

Add a `batch_create` tool that accepts an array of operations and executes them transactionally. This is more flexible than entity-specific batch tools.

### Tools to add:
- `batch_create_contacts` — create multiple contacts in one call. Accepts an array of contact creation inputs. Returns an array of created contacts.
- `batch_tag_contacts` — apply a tag to multiple contacts in one call. Accepts a tag name and an array of contact IDs.
- `batch_create_activities` — create multiple activities in one call.

### Implementation notes:
- Each batch operation should run inside a SQLite transaction for atomicity
- Set reasonable limits (e.g., max 50 items per batch call)
- On error, roll back the entire batch and return which item failed
- Return all created records so the LLM has IDs for follow-up operations
- Input schema uses z.array() of the existing individual create schemas
- Reuse existing service methods inside the batch loop (don't duplicate SQL)

### Files to modify:
- `src/services/contacts.ts` — add `batchCreate(userId, inputs[])` method
- `src/services/tags-groups.ts` — add `batchTagContacts(userId, tagName, contactIds[])` method
- `src/services/activities.ts` — add `batchCreate(userId, inputs[])` method
- `src/server/mcp-server.ts` — register batch tools

### Test files to create/modify:
- Add batch operation tests to existing integration test files

## Checklist
- [x] Add `batchCreate()` to ContactService with transaction wrapping
- [x] Add `batchTagContacts()` to TagService
- [x] Add `batchCreate()` to ActivityService with transaction wrapping
- [x] Register `batch_create_contacts` tool in mcp-server.ts
- [x] Register `batch_tag_contacts` tool in mcp-server.ts
- [x] Register `batch_create_activities` tool in mcp-server.ts
- [x] Add integration tests for all batch operations
- [x] Verify transaction rollback behavior on partial failures