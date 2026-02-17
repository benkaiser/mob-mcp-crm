---
# mob-crm-6mra
title: gift_tracker tool
status: completed
type: feature
priority: normal
created_at: 2026-02-17T12:46:12Z
updated_at: 2026-02-17T12:52:22Z
parent: mob-crm-0w2q
---

Add a \`gift_tracker\` MCP tool that provides a cross-contact view of gifts across all contacts, useful for tracking gift pipelines around holidays and birthdays.

## Motivation

\`gift_list\` is contact-scoped. Around holidays, birthdays, and special occasions, users want the full pipeline view: "what gifts do I need to buy?", "what gift ideas do I have saved?", "what have I given recently?" A cross-contact gift overview enables proactive gift planning.

## Tool Specification

**Name:** \`gift_tracker\`

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`status\` | enum | - | Optional: filter by gift status: 'idea', 'planned', 'purchased', 'given', 'received' |
| \`direction\` | enum | - | Optional: 'giving' or 'receiving' |
| \`occasion\` | string | - | Optional: filter by occasion (LIKE match, e.g., "birthday", "Christmas") |
| \`sort_by\` | enum | 'date' | Sort field: 'date', 'created_at', 'estimated_cost' |
| \`sort_order\` | enum | 'desc' | Sort direction: 'asc' or 'desc' |
| \`page\` | number | 1 | Page number |
| \`per_page\` | number | 20 | Results per page |

**Returns:**
\`\`\`json
{
  "data": [
    {
      "id": "gift123",
      "name": "Kindle Paperwhite",
      "description": "She mentioned wanting one",
      "url": "https://...",
      "estimated_cost": 139.99,
      "currency": "USD",
      "occasion": "birthday",
      "status": "idea",
      "direction": "giving",
      "date": null,
      "contact_id": "abc123",
      "contact_name": "Jane Smith"
    }
  ],
  "total": 8,
  "page": 1,
  "per_page": 20,
  "summary": {
    "total_estimated_cost": { "USD": 350.00 },
    "by_status": { "idea": 3, "planned": 2, "purchased": 1, "given": 2 }
  }
}
\`\`\`

## Implementation Notes

- JOIN gifts with contacts for contact_name denormalization
- Occasion filter should use LIKE for flexible matching (e.g., "birth" matches "birthday")
- Include a \`summary\` object with aggregate stats: total estimated cost by currency, count by status
- Sort by date should handle nulls (null dates sorted last)
- Exclude soft-deleted gifts and contacts
- Filter by user_id through contacts table

## Checklist

- [ ] Add \`getGiftTracker(userId, options)\` method to GiftService
- [ ] Write SQL with JOIN on contacts, optional filters for status/direction/occasion
- [ ] Compute summary aggregates (cost by currency, count by status)
- [ ] Handle null date sorting
- [ ] Register \`gift_tracker\` tool in mcp-server.ts with Zod schema
- [ ] Add tests for: status filter, direction filter, occasion LIKE matching, sort options, summary aggregation, pagination
