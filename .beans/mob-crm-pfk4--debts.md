---
# mob-crm-pfk4
title: Debts
status: todo
type: epic
priority: normal
created_at: 2026-02-09T00:06:13Z
updated_at: 2026-02-09T00:06:13Z
parent: mob-crm-d92t
---

Implement debt tracking.

## Scope
- Debts table migration
- Direction: i_owe_them vs they_owe_me
- Fields: amount, currency, reason, incurred_at, settled_at, status
- Debt service: create, get, update, soft-delete, settle, list, summary (net balance per contact)
- MCP tools: debt_list, debt_create, debt_update, debt_settle, debt_delete, debt_summary
- Integration tests including net balance calculation