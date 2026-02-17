---
# mob-crm-6z37
title: upcoming_reminders tool
status: completed
type: feature
priority: normal
created_at: 2026-02-17T12:46:12Z
updated_at: 2026-02-17T12:50:42Z
parent: mob-crm-0w2q
---

Add an \`upcoming_reminders\` MCP tool that queries across all contacts to find reminders due soon, including overdue ones.

## Motivation

\`reminder_list\` currently works per-contact or returns all reminders without date-range awareness. Users want to ask "what reminders do I have this week?" or "what's overdue?" in a single call. The LLM needs a time-windowed, cross-contact view.

## Tool Specification

**Name:** \`upcoming_reminders\`

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`days_ahead\` | number (1-365) | 14 | Look-ahead window in days from today |
| \`status\` | enum | 'active' | Filter by reminder status: 'active' or 'snoozed' |
| \`include_overdue\` | boolean | true | Include reminders with reminder_date before today |

**Returns:** Array sorted by reminder_date (overdue first, then soonest):
\`\`\`json
{
  "data": [
    {
      "id": "rem123",
      "title": "Follow up on job offer",
      "description": "...",
      "reminder_date": "2026-02-10",
      "frequency": "one_time",
      "status": "active",
      "is_overdue": true,
      "days_until": -7,
      "contact_id": "abc123",
      "contact_name": "Jane Smith"
    }
  ],
  "total": 5
}
\`\`\`

## Implementation Notes

- JOIN reminders with contacts to denormalize contact_name
- \`days_until\` can be negative for overdue reminders
- \`is_overdue\` convenience boolean
- Sort order: overdue first (by date asc), then upcoming (by date asc)
- Exclude soft-deleted reminders and soft-deleted contacts
- Filter by user_id through the contacts table (reminders → contacts → user_id)

## Checklist

- [ ] Add \`getUpcomingReminders(userId, options)\` method to ReminderService
- [ ] Write SQL query with JOIN on contacts, date range filter, and overdue logic
- [ ] Compute \`is_overdue\` and \`days_until\` in service layer
- [ ] Register \`upcoming_reminders\` tool in mcp-server.ts with Zod schema
- [ ] Add tests for: upcoming range, overdue inclusion/exclusion, snoozed filter, cross-contact results
