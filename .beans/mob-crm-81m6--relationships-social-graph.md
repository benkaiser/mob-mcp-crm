---
# mob-crm-81m6
title: Relationships & Social Graph
status: todo
type: epic
priority: normal
created_at: 2026-02-09T00:05:46Z
updated_at: 2026-02-09T00:05:46Z
parent: mob-crm-8o31
---

Implement bidirectional relationships between contacts.

## Scope
- Relationships table migration
- Relationship types configuration table with all predefined types (Love, Family, Friend, Work)
- Auto-inverse relationship creation (e.g., parent → child)
- Relationship service: add, update, remove (cascading both directions), list
- MCP tools: relationship_add, relationship_update, relationship_remove, relationship_list
- Integration tests for bidirectional creation and cascading deletion
- Unit tests for inverse type resolution