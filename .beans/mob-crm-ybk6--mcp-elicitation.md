---
# mob-crm-ybk6
title: MCP Elicitation
status: completed
type: epic
priority: normal
created_at: 2026-02-09T00:06:26Z
updated_at: 2026-02-09T00:52:41Z
parent: mob-crm-05bd
---

Implement MCP elicitation for guided data entry.

## Scope
- Use MCP elicitation protocol to present structured forms to users
- Pre-fill forms with data parsed from the AI's natural language understanding
- Elicitation for: contact creation, relationship creation, activity logging, reminder creation, address entry, life event creation, gift creation
- Progressive disclosure (basic fields first, expandable optional sections)
- Graceful degradation when MCP client doesn't support elicitation (fall back to conversational)
- Tests for elicitation flow