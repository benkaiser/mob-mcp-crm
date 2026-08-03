---
# mob-crm-h9xm
title: Structured relationship types with user-custom values
status: completed
type: feature
priority: normal
created_at: 2026-08-02T23:54:59Z
updated_at: 2026-08-03T00:02:01Z
---

The contact relationship `relationship_type` field is free-form text in the web UI (RelationshipEditor uses a plain <Input>), which leads to inconsistent values and prevents correct inverse-relationship drawing. It should be a fixed dropdown of canonical relationship types, and users should be able to add their own custom types (with an inverse) from Settings.

## Background
- Canonical types + inverse mapping already exist in `src/services/relationships.ts` (`INVERSE_MAP`, `getInverseType()`, `getRelationshipTypes()`), grouped as Love/Family/Friend/Work.
- The MCP tool (`src/server/mcp-server.ts` ~line 481) already constrains `relationship_type` to a zod enum from `getRelationshipTypes()`.
- The web editor (`web/src/pages/contacts/SubEntityEditors.tsx` RelationshipEditor ~line 175-221) uses a free-form <Input data-testid=rel-type>.
- Custom types currently fall back to a symmetric inverse (getInverseType returns the same type).

## Requirements
1. Web relationship editor uses a <Select> of canonical types (grouped by category is a nice-to-have via <optgroup>) instead of free-form text.
2. Users can add/remove custom relationship types in Settings, each with a label and an inverse (which may be itself for symmetric). Custom types are user-scoped and persisted.
3. Custom types appear in the relationship-type dropdown alongside canonical ones.
4. Inverse resolution must consult user custom types so auto-created inverse relationships are correct.
5. Expose the merged (canonical + custom) type list to the web app via the web-api.

## Checklist
- [x] DB migration 015: user-scoped custom_relationship_types table (id, user_id, forward_label/value, inverse_value, timestamps; unique per user+value)
- [x] Service layer: CRUD for custom relationship types; merge with canonical; user-aware getInverseType
- [x] Web-api endpoints: GET merged relationship types; GET/POST/DELETE custom types
- [x] Settings UI section to list/add/remove custom relationship types
- [x] RelationshipEditor: replace free-form input with a Select populated from the merged list
- [x] Update MCP tool if needed so custom types are accepted (enum may need to allow custom values per-user)
- [x] Tests: service + web-api integration tests; update e2e (rel-type is now a select)
- [x] typecheck, lint, unit + e2e green