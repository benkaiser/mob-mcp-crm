---
# mob-crm-4vvs
title: Add contact_merge tool with duplicate detection
status: completed
type: feature
priority: high
created_at: 2026-02-17T13:28:48Z
updated_at: 2026-02-17T13:54:01Z
parent: mob-crm-6zu2
---

Duplicate contacts are inevitable. There's no way to merge two contacts (combining their notes, activities, relationships, etc.) or detect potential duplicates.

## Design

### Tools to add:
- `contact_merge` — merge two contacts into one. Takes a primary contact ID and a secondary contact ID. All child records (notes, activities, relationships, contact methods, addresses, custom fields, food preferences, life events, reminders, gifts, debts, tasks, tags) from the secondary contact are reassigned to the primary. The secondary contact is soft-deleted. Fields from the secondary contact that are null on the primary are copied over (non-destructive merge).
- `contact_find_duplicates` — scan for potential duplicate contacts. Uses fuzzy matching on name (first + last), email, and phone number. Returns pairs of potential duplicates with a confidence score.

### Implementation notes for contact_merge:
- Must run in a single SQLite transaction
- For each child table with a `contact_id` FK, UPDATE to point to the primary contact
- For `relationships`: if the secondary has a relationship to the primary, skip it (can't have self-relationship). If both contacts have a relationship to the same third party, keep the primary's and delete the secondary's.
- For `contact_tags`: use INSERT OR IGNORE to avoid duplicate tag assignments
- For `food_preferences`: merge arrays (union of allergies, dietary preferences, etc.)
- For `custom_fields`: only copy fields that don't exist on the primary
- Copy non-null fields from secondary to primary where primary's field is null
- Soft-delete the secondary contact after merge
- Return the merged primary contact with a summary of what was moved

### Implementation notes for contact_find_duplicates:
- Compare normalized names (lowercase, trimmed)
- Compare email addresses and phone numbers across contact_methods table
- Return matches grouped by pair with a reason (e.g., "same email", "similar name")
- Limit results (e.g., top 20 potential duplicates)

### Files to modify:
- `src/services/contacts.ts` — add `merge(userId, primaryId, secondaryId)` and `findDuplicates(userId)` methods
- `src/server/mcp-server.ts` — register both tools

### Test files to create/modify:
- `tests/integration/contact-merge.test.ts` — comprehensive merge tests covering all child entity types

## Checklist
- [x] Add `merge()` method to ContactService
- [x] Handle reassignment of notes, activities, relationships, contact methods, addresses, custom fields, food preferences, life events, reminders, gifts, debts, tasks, tags
- [x] Handle relationship deduplication and self-relationship prevention
- [x] Handle contact_tags deduplication
- [x] Handle food_preferences array merging
- [x] Handle custom_fields deduplication
- [x] Copy non-null fields from secondary to primary
- [x] Soft-delete secondary contact after merge
- [x] Add `findDuplicates()` method to ContactService
- [x] Register `contact_merge` tool in mcp-server.ts
- [x] Register `contact_find_duplicates` tool in mcp-server.ts
- [x] Add comprehensive integration tests