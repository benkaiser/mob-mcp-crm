---
# mob-crm-wtof
title: activity_log tool
status: completed
type: feature
priority: normal
created_at: 2026-02-17T12:46:12Z
updated_at: 2026-02-17T12:51:50Z
parent: mob-crm-0w2q
---

Add an \`activity_log\` MCP tool that provides a chronological journal view of activities across all contacts.

## Motivation

\`activity_list\` exists but is contact-scoped. Users want to ask "what have I been up to this week?", "show me all my phone calls", or "recent interactions." A time-windowed, cross-contact activity feed is essential for weekly reviews and daily briefings.

## Tool Specification

**Name:** \`activity_log\`

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`type\` | enum | - | Optional: filter by activity type (phone_call, video_call, text_message, in_person, email, activity, other) |
| \`days_back\` | number (1-365) | 7 | Look-back window in days |
| \`since\` | string (ISO date) | - | Optional: alternative to days_back — show activities since this date |
| \`contact_id\` | string | - | Optional: filter to a specific contact |
| \`sort_order\` | enum | 'desc' | Sort direction: 'asc' or 'desc' (by occurred_at) |
| \`page\` | number | 1 | Page number |
| \`per_page\` | number | 20 | Results per page |

**Returns:**
\`\`\`json
{
  "data": [
    {
      "id": "act123",
      "type": "phone_call",
      "title": "Caught up about holidays",
      "description": "Discussed travel plans...",
      "occurred_at": "2026-02-15T14:30:00Z",
      "duration_minutes": 25,
      "location": null,
      "participants": [
        { "contact_id": "abc123", "contact_name": "Jane Smith" }
      ]
    }
  ],
  "total": 15,
  "page": 1,
  "per_page": 20
}
\`\`\`

## Implementation Notes

- JOIN activities with activity_participants and contacts to denormalize participant names
- Use a subquery or GROUP_CONCAT to collapse multiple participants into an array per activity
- When \`since\` is provided, it takes precedence over \`days_back\`
- Sort by \`occurred_at\` in the specified direction
- Exclude soft-deleted activities and contacts
- Filter by user_id directly on activities table

## Checklist

- [ ] Add \`getActivityLog(userId, options)\` method to ActivityService
- [ ] Write SQL with JOIN on activity_participants + contacts, date range filter
- [ ] Handle participant aggregation (multiple participants per activity)
- [ ] Implement \`since\` vs \`days_back\` date resolution
- [ ] Register \`activity_log\` tool in mcp-server.ts with Zod schema
- [ ] Add tests for: date range, type filter, multi-participant activities, sort order, pagination
