---
# mob-crm-vryq
title: Deleting one relationship removes all relationships between two contacts
status: completed
type: bug
priority: normal
created_at: 2026-08-03T00:57:17Z
updated_at: 2026-08-03T01:05:45Z
---

Deleting ONE relationship between two contacts removes ALL relationships between them.

## Root cause
`src/services/relationships.ts` `remove(id)` deletes the forward row by `id` (correct) but deletes the inverse row by contact pair only, with NO relationship_type filter:
```
DELETE FROM relationships WHERE contact_id = ? AND related_contact_id = ?
```
run with (existing.related_contact_id, existing.contact_id). When two contacts have multiple relationships of different types (each with its own auto-created inverse), this removes EVERY inverse row between them, not just the inverse of the one being deleted. (Table has UNIQUE(contact_id, related_contact_id, relationship_type), so the correct inverse is uniquely identified by the type triple.)

## Fix
Delete only the specific inverse: add `AND relationship_type = ?` using `getInverseType(existing.relationship_type)`:
```
DELETE FROM relationships
WHERE contact_id = ? AND related_contact_id = ? AND relationship_type = ?
```
run with (existing.related_contact_id, existing.contact_id, getInverseType(existing.relationship_type)). Keep the forward delete by id. Keep it in the existing transaction. (Confirm `getInverseType` is already imported/used in this file — it is used elsewhere in the service.)

## Test (must add, confirming correct behavior)
Add an integration test (tests/integration, in-memory SQLite): create two contacts A and B; add TWO relationships of different types between them (e.g. A is 'parent' of B, and A is 'colleague' of B — each auto-creates its inverse). Delete ONE of them (e.g. the parent relationship). Assert:
- the deleted relationship AND its inverse are gone,
- the OTHER relationship AND its inverse still exist (list A's and B's relationships and verify counts/types).
Also keep/verify a test for the simple single-relationship delete (both directions removed).

## Validation
- `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test` (vitest). Extend the existing relationships test file (search tests/integration for relationship).

## Checklist
- [x] Fix inverse DELETE to filter by relationship_type (getInverseType)
- [x] Integration test: deleting one of multiple relationships leaves the others intact
- [x] Verify single-relationship delete still removes both directions
- [x] typecheck + lint + vitest green
