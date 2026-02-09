---
# mob-crm-agx6
title: Implement contact sub-entity services and MCP tools
status: todo
type: task
priority: high
created_at: 2026-02-09T00:07:20Z
updated_at: 2026-02-09T00:07:20Z
parent: mob-crm-uq5p
---

Build services and tools for contact methods, addresses, food preferences, and custom fields.

## Checklist
- [ ] Create src/services/contact-methods.ts — add, update, remove, list
- [ ] Create src/services/addresses.ts — add, update, remove, list
- [ ] Create src/services/food-preferences.ts — get, upsert (create or update)
- [ ] Create src/services/custom-fields.ts — add, update, remove, list
- [ ] Create MCP tools: contact_method_add, contact_method_update, contact_method_remove
- [ ] Create MCP tools: address_add, address_update, address_remove
- [ ] Contact get should return all sub-entities in a single response
- [ ] Integration tests for each sub-entity CRUD
- [ ] Test multiple entries of same type (e.g., two email addresses)
- [ ] Test primary flag behavior