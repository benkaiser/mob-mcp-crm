---
# mob-crm-jraa
title: Expand global_search to cover all entities
status: completed
type: feature
priority: high
created_at: 2026-02-17T13:29:03Z
updated_at: 2026-02-17T13:56:37Z
parent: mob-crm-6zu2
---

global_search currently covers contacts, notes, activities, life_events, gifts, and tasks — but NOT reminders, debts, relationships, custom fields, contact methods, or addresses. Searching for a phone number, an address, or a debt reason requires the LLM to guess which tool to use.

## Design

Expand the SearchService to query additional tables when performing a global search.

### Entities to add to global_search:
- **reminders** — search title and description fields
- **debts** — search reason field
- **relationships** — search by related contact name and relationship type
- **contact_methods** — search by value (email address, phone number, social handle)
- **addresses** — search by street, city, state, country, postal_code
- **custom_fields** — search by field name and value

### Implementation notes:
- The existing SearchService in `src/services/search.ts` runs parallel queries across entity tables using LIKE matching
- Each entity search is a separate SQL query joined to contacts for user_id scoping
- Follow the existing pattern: each new entity gets its own search method that returns results in the standard format `{ type, id, contact_id, contact_name, summary, matched_field }`
- contact_methods and addresses don't have their own IDs exposed in tools currently, so return the contact_id and contact_name as the primary result
- Ensure all new queries filter by `user_id` through the contacts table join
- Consider making entity types filterable (e.g., `entity_types: ['contacts', 'phone_numbers', 'addresses']`) so the LLM can narrow searches

### Files to modify:
- `src/services/search.ts` — add search methods for reminders, debts, relationships, contact methods, addresses, custom fields
- `src/server/mcp-server.ts` — update the `global_search` tool registration to include the new entity types and add an optional `entity_types` filter parameter

### Test files to modify:
- `tests/integration/search.test.ts` — add tests for searching each new entity type

## Checklist
- [x] Add reminder search to SearchService
- [x] Add debt search to SearchService
- [x] Add relationship search to SearchService
- [x] Add contact method search (phone, email, social) to SearchService
- [x] Add address search to SearchService
- [x] Add custom field search to SearchService
- [x] Add optional `entity_types` filter parameter to global_search tool
- [x] Update global_search tool registration in mcp-server.ts
- [x] Add integration tests for all new entity searches
- [x] Test that user_id scoping works correctly for all new entity types