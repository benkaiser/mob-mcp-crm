---
# mob-crm-bg53
title: Gifts
status: completed
type: epic
priority: normal
created_at: 2026-02-09T00:06:12Z
updated_at: 2026-02-09T00:49:09Z
parent: mob-crm-d92t
---

Implement gift tracking.

## Scope
- Gifts table migration
- Gift lifecycle: idea → planned → purchased → given/received
- Direction: giving vs receiving
- Fields: name, description, url, estimated_cost, currency, occasion, status, date
- Gift service: create, get, update, soft-delete, list (filterable by contact, status, direction)
- MCP tools: gift_list, gift_create, gift_update, gift_delete
- Integration tests including status workflow