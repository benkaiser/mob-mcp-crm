---
# mob-crm-xhjv
title: Implement contact service and MCP tools
status: in-progress
type: task
priority: high
created_at: 2026-02-09T00:07:18Z
updated_at: 2026-02-09T00:14:22Z
parent: mob-crm-uq5p
---

Build the core contact CRUD service layer and MCP tool definitions.

## Checklist
- [x] Create src/services/contacts.ts with methods: create, get, update, softDelete, list (paginated)
- [x] Handle all contact fields (identity, birthday, status, favorite, how-we-met, work info)
- [x] Birthday mode parsing: full_date, month_day, approximate_age
- [x] Age calculation (dynamic, labeled approximate when estimated)
- [x] Contact status transitions (active ↔ archived ↔ deceased)
- [ ] Create src/tools/contacts.ts — MCP tool definitions: contact_create, contact_get, contact_update, contact_delete, contact_list
- [ ] Wire tools into MCP server
- [x] Unit tests for birthday parsing and age calculation
- [x] Integration tests for full contact CRUD lifecycle