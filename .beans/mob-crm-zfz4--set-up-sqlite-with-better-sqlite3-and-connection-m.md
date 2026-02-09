---
# mob-crm-zfz4
title: Set up SQLite with better-sqlite3 and connection manager
status: completed
type: task
priority: high
created_at: 2026-02-09T00:07:02Z
updated_at: 2026-02-09T00:14:17Z
parent: mob-crm-zbag
---

Install better-sqlite3 and create a database connection manager.

## Checklist
- [x] Install better-sqlite3 and @types/better-sqlite3
- [x] Create src/db/connection.ts with a connection manager class
- [x] Support file-based databases (using MOB_DATA_DIR path)
- [x] Support in-memory databases (for testing and forgetful mode)
- [x] Enable WAL mode and foreign keys pragma
- [x] Create test helper that provides in-memory database instances