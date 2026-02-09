---
# mob-crm-agx6
title: Implement contact sub-entity services and MCP tools
status: completed
type: task
priority: high
created_at: 2026-02-09T00:07:20Z
updated_at: 2026-02-09T00:32:00Z
parent: mob-crm-uq5p
---

Build services and tools for contact methods, addresses, food preferences, and custom fields.

## Checklist
- [x] Create src/services/contact-methods.ts — add, update, remove, list
- [x] Create src/services/addresses.ts — add, update, remove, list
- [x] Create src/services/food-preferences.ts — get, upsert (create or update)
- [x] Create src/services/custom-fields.ts — add, update, remove, list
- [x] Create MCP tools: contact_method_add, contact_method_update, contact_method_remove
- [x] Create MCP tools: address_add, address_update, address_remove
- [x] Create MCP tools: food_preferences_get, food_preferences_upsert
- [x] Create MCP tools: custom_field_add, custom_field_update, custom_field_remove
- [x] Contact get should return all sub-entities in a single response
- [x] Integration tests for each sub-entity CRUD
- [x] Test multiple entries of same type (e.g., two email addresses)
- [x] Test primary flag behavior
