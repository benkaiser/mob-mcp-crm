---
# mob-crm-xhjv
title: Implement contact service and MCP tools
status: completed
type: task
priority: high
created_at: 2026-02-09T00:07:18Z
updated_at: 2026-02-09T00:32:00Z
parent: mob-crm-uq5p
---

Build the core contact CRUD service layer and MCP tool definitions.

## Checklist
- [x] Create src/services/contacts.ts with methods: create, get, update, softDelete, list (paginated)
- [x] Handle all contact fields (identity, birthday, status, favorite, how-we-met, work info)
- [x] Birthday mode parsing: full_date, month_day, approximate_age
- [x] Age calculation (dynamic, labeled approximate when estimated)
- [x] Contact status transitions (active ↔ archived ↔ deceased)
- [x] Create MCP tool definitions: contact_create, contact_get, contact_update, contact_delete, contact_list, contact_search
- [x] Wire tools into MCP server (src/server/mcp-server.ts)
- [x] Unit tests for birthday parsing and age calculation
- [x] Integration tests for full contact CRUD lifecycle
