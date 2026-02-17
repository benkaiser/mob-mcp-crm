---
# mob-crm-v9b6
title: contacts_needing_attention tool
status: completed
type: feature
priority: normal
created_at: 2026-02-17T12:46:12Z
updated_at: 2026-02-17T12:53:26Z
parent: mob-crm-0w2q
---

Add a \`contacts_needing_attention\` MCP tool that identifies contacts the user hasn't interacted with recently.

## Motivation

This is the **killer feature** of a personal CRM — proactively surfacing relationships that need nurturing. "Who haven't I talked to in a while?" requires a JOIN across contacts → activity_participants → activities with date arithmetic. Impossible for the LLM to do with current tools without O(N) calls.

## Tool Specification

**Name:** \`contacts_needing_attention\`

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`days_since_last_interaction\` | number | 30 | Minimum days since last activity to be included |
| \`status\` | enum | 'active' | Contact status filter |
| \`tag_name\` | string | - | Optional: filter to contacts with this tag (e.g., "close friends") |
| \`is_favorite\` | boolean | - | Optional: filter to favorites only |
| \`limit\` | number (1-100) | 20 | Max results to return |

**Returns:** Contacts sorted by staleness (longest since last interaction first):
\`\`\`json
{
  "data": [
    {
      "contact_id": "abc123",
      "contact_name": "Jane Smith",
      "company": "Acme Corp",
      "is_favorite": true,
      "tags": ["close-friends"],
      "last_interaction_date": "2026-01-01T10:00:00Z",
      "last_interaction_type": "phone_call",
      "last_interaction_title": "Caught up about holidays",
      "days_since_interaction": 47,
      "total_interactions": 12
    }
  ],
  "total": 15
}
\`\`\`

## Implementation Notes

- Use a LEFT JOIN from contacts → activity_participants → activities to find the MAX(occurred_at) per contact
- Contacts with NO interactions at all should also be included (they need the most attention!), with \`last_interaction_date\` as null and \`days_since_interaction\` calculated from their \`created_at\`
- Subquery or CTE to get last activity details (type, title) efficiently
- Include a \`total_interactions\` count for context
- Tag filtering requires an additional JOIN through contact_tags + tags
- Exclude deceased contacts and soft-deleted contacts
- Exclude the user's own self-contact (is_me = 1)

## Checklist

- [ ] Add \`getContactsNeedingAttention(userId, options)\` method to ContactService (or a new AnalyticsService)
- [ ] Write SQL with LEFT JOIN on activity_participants + activities, GROUP BY contact, HAVING date filter
- [ ] Handle contacts with zero interactions (NULL last activity)
- [ ] Include last interaction details via subquery/CTE
- [ ] Add tag filtering JOIN
- [ ] Register \`contacts_needing_attention\` tool in mcp-server.ts with Zod schema
- [ ] Add tests for: staleness sorting, zero-interaction contacts, tag filter, favorite filter, self-contact exclusion
