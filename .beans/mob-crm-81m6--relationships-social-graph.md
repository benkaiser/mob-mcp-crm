---
# mob-crm-81m6
title: Relationships & Social Graph
status: completed
type: epic
priority: normal
created_at: 2026-02-09T00:05:46Z
updated_at: 2026-02-09T00:38:00Z
parent: mob-crm-8o31
---

Implement bidirectional relationships between contacts.

## Scope
- [x] Relationships table migration
- [x] Relationship types configuration table with all predefined types (Love, Family, Friend, Work)
- [x] Auto-inverse relationship creation (e.g., parent → child)
- [x] Relationship service: add, update, remove (cascading both directions), list
- [x] MCP tools: relationship_add, relationship_update, relationship_remove, relationship_list
- [x] Integration tests for bidirectional creation and cascading deletion
- [x] Unit tests for inverse type resolution
