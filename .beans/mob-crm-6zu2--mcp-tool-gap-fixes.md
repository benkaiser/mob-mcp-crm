---
# mob-crm-6zu2
title: MCP Tool Gap Fixes
status: todo
type: epic
priority: high
created_at: 2026-02-17T13:41:21Z
updated_at: 2026-02-17T13:41:21Z
---

Address critical and important gaps identified in the MCP tool gap analysis. These features improve data safety, reduce LLM round-trips, improve search completeness, and fill CRUD gaps.

Covers:
1. Entity restore tools (undo soft-deletes)
2. Bulk/batch operations (reduce round-trips)
3. Contact merge + duplicate detection (data quality)
5. Activity type update/delete (CRUD completeness)
7. Global search expansion (all entities searchable)
8. Enriched contact_get (full context in one call)