---
# mob-crm-gsnc
title: Contact Timeline
status: todo
type: epic
priority: normal
created_at: 2026-02-09T00:06:00Z
updated_at: 2026-02-09T00:06:00Z
parent: mob-crm-53jb
---

Implement the unified contact timeline view.

## Scope
- Timeline is a computed view, not a separate table
- Aggregate across: activities, life events, notes, reminders, gifts, debts, relationship changes, contact creation
- Reverse chronological order, paginated
- Filterable by entry type
- MCP tool: contact_timeline
- Integration tests verifying aggregation across entity types