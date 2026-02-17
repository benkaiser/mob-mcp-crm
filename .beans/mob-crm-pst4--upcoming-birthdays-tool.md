---
# mob-crm-pst4
title: upcoming_birthdays tool
status: completed
type: feature
priority: normal
created_at: 2026-02-17T12:46:12Z
updated_at: 2026-02-17T12:50:07Z
parent: mob-crm-0w2q
---

Add an \`upcoming_birthdays\` MCP tool that queries across all contacts to find birthdays within a given time window.

## Motivation

Users frequently ask "who has a birthday coming up?" or "any birthdays this month?" Currently this requires the LLM to fetch all contacts and manually filter — inefficient and error-prone given the complexity of birthday_mode (full_date, month_day, approximate_age) and cross-year-boundary date math.

## Tool Specification

**Name:** \`upcoming_birthdays\`

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`days_ahead\` | number (1-365) | 30 | Look-ahead window in days from today |
| \`month\` | number (1-12) | - | Optional: show all birthdays in a specific month instead of using days_ahead |

**Returns:** Array of objects sorted by next occurrence (soonest first):
\`\`\`json
{
  "data": [
    {
      "contact_id": "abc123",
      "contact_name": "Jane Smith",
      "birthday_display": "March 15",
      "birthday_date": "1990-03-15",
      "birthday_mode": "full_date",
      "age_turning": 36,
      "days_until": 5,
      "is_today": false
    }
  ],
  "total": 3
}
\`\`\`

## Implementation Notes

- Service method should handle all three birthday_mode variants
- For \`month_day\` mode, age_turning should be null
- For \`approximate_age\` mode, age_turning should be approximate
- \`days_until\` should always be 0-365 (wrap around year boundary)
- \`is_today\` convenience flag for "happy birthday!" scenarios
- SQL should use birthday_month and birthday_day columns for efficient matching
- When \`month\` param is provided, ignore \`days_ahead\` and return all birthdays in that calendar month
- Exclude contacts where status = 'deceased' or deleted_at is set

## Checklist

- [ ] Add \`getUpcomingBirthdays(userId, options)\` method to ContactService
- [ ] Write SQL query that matches birthday_month/birthday_day within date range, handling year wrap-around
- [ ] Compute \`days_until\` and \`age_turning\` in the service layer
- [ ] Register \`upcoming_birthdays\` tool in mcp-server.ts with Zod schema
- [ ] Add tests for: normal range, year boundary (Dec→Jan), month filter, all birthday_modes, deceased exclusion
