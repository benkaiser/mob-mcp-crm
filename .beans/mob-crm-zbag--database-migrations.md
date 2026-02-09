---
# mob-crm-zbag
title: Database & Migrations
status: completed
type: epic
priority: high
created_at: 2026-02-09T00:05:35Z
updated_at: 2026-02-09T00:14:17Z
parent: mob-crm-bkbs
blocking:
    - mob-crm-ek4t
    - mob-crm-uq5p
---

Set up SQLite database layer with migration system.

## Scope
- Install and configure better-sqlite3
- Create database connection manager (supports both file-based and in-memory)
- Build migration runner (ordered SQL files in src/db/migrations/)
- Create initial migration with all tables for contacts and sub-entities
- Support MOB_DATA_DIR for configurable database file location
- Create test helpers for in-memory database setup/teardown