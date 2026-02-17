---
# mob-crm-kojn
title: Enrich contact_get to return all related data in one call
status: completed
type: feature
priority: critical
created_at: 2026-02-17T13:29:14Z
updated_at: 2026-02-17T13:45:46Z
parent: mob-crm-6zu2
---

contact_get currently returns the contact fields + contact methods, addresses, food preferences, and custom fields. But it does NOT include: relationships, tags, notes, recent activities, life events, reminders, tasks, gifts, or debts. The LLM needs 8-10 follow-up calls to get the full picture of a contact.

This is the single highest-impact improvement: when an LLM asks "tell me about Sarah", it should get everything in one call instead of 10.

## Design

Enrich the existing \`contact_get\` tool to return ALL related data for a contact. Do NOT create a separate \`contact_get_full\` tool — just make \`contact_get\` comprehensive.

### Data to include in the response:
1. **Core contact fields** (already included) — name, birthday, company, job, etc.
2. **Contact methods** (already included) — email, phone, social
3. **Addresses** (already included)
4. **Food preferences** (already included)
5. **Custom fields** (already included)
6. **Relationships** — list of related contacts with relationship type and the related contact's name
7. **Tags** — list of tag names/colors assigned to this contact
8. **Notes** — recent notes (e.g., last 10), with id, title, body preview, is_pinned, created_at
9. **Activities** — recent activities (e.g., last 10), with id, title, type, occurred_at, summary
10. **Life events** — all life events, with id, title, event_type, occurred_at
11. **Reminders** — active reminders (not completed/dismissed), with id, title, next_reminder_at, frequency
12. **Tasks** — open tasks (not completed), with id, title, priority, due_date, status
13. **Gifts** — recent gifts (e.g., last 10), with id, name, status, direction, date
14. **Debts** — active debts (unsettled), with id, amount, direction, reason, currency
15. **Debt summary** — total owed/owing

### Implementation notes:
- Modify \`ContactService.get()\` to accept an options parameter or make it always return full data
- Since this is the primary tool for understanding a contact, it should always return everything — no optional flag needed. The LLM will always benefit from having the full picture.
- For performance, use individual SQL queries per entity type (not one massive JOIN which would create cartesian products)
- Limit notes, activities, and gifts to the most recent 10 to keep response size reasonable
- Sort notes by is_pinned DESC, created_at DESC (pinned first)
- Sort activities by occurred_at DESC
- Only return active/open reminders and tasks
- Only return unsettled debts
- Include life events without limit (they're typically few)
- The response structure should nest each entity type under a clear key

### Response structure:
\`\`\`json
{
  "id": "...",
  "first_name": "Sarah",
  ...all existing contact fields...,
  "contact_methods": [...],
  "addresses": [...],
  "food_preferences": {...},
  "custom_fields": [...],
  "relationships": [
    { "id": "...", "contact_id": "...", "contact_name": "Mike Smith", "relationship_type": "friend" }
  ],
  "tags": [
    { "id": "...", "name": "close-friends", "color": "#ff0000" }
  ],
  "recent_notes": [
    { "id": "...", "title": "...", "body": "...", "is_pinned": true, "created_at": "..." }
  ],
  "recent_activities": [
    { "id": "...", "title": "...", "type": "...", "occurred_at": "...", "summary": "..." }
  ],
  "life_events": [
    { "id": "...", "title": "...", "event_type": "...", "occurred_at": "..." }
  ],
  "active_reminders": [
    { "id": "...", "title": "...", "next_reminder_at": "...", "frequency": "..." }
  ],
  "open_tasks": [
    { "id": "...", "title": "...", "priority": "...", "due_date": "...", "status": "..." }
  ],
  "recent_gifts": [
    { "id": "...", "name": "...", "status": "...", "direction": "...", "date": "..." }
  ],
  "active_debts": [
    { "id": "...", "amount": 50, "direction": "owed_to_me", "reason": "...", "currency": "USD" }
  ],
  "debt_summary": { "total_owed": 150, "total_owing": 50, "net": 100 }
}
\`\`\`

### Files to modify:
- \`src/services/contacts.ts\` — modify \`get()\` method to fetch and include all related data. Will need to import or query from other service tables directly.
- \`src/server/mcp-server.ts\` — update the \`contact_get\` tool description to document the enriched response
- Alternatively, create a new method \`getFullProfile(userId, contactId)\` that calls existing services internally

### Test files to modify:
- \`tests/integration/contacts.test.ts\` — add tests verifying that related data is included in the get response

## Checklist
- [x] Add relationships to contact_get response
- [x] Add tags to contact_get response
- [x] Add recent notes (last 10, pinned first) to contact_get response
- [x] Add recent activities (last 10) to contact_get response
- [x] Add life events to contact_get response
- [x] Add active reminders to contact_get response
- [x] Add open tasks to contact_get response
- [x] Add recent gifts (last 10) to contact_get response
- [x] Add active debts and debt summary to contact_get response
- [x] Update contact_get tool description in mcp-server.ts
- [x] Add integration tests for enriched contact_get response
- [x] Verify performance is acceptable with all the additional queries