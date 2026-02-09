---
# mob-crm-zfz4
title: Set up SQLite with better-sqlite3 and connection manager
status: todo
type: task
priority: high
created_at: 2026-02-09T00:07:02Z
updated_at: 2026-02-09T00:07:02Z
parent: mob-crm-zbag
---

Install better-sqlite3 and create a database connection manager.

## Checklist
- [ ] Install better-sqlite3 and @types/better-sqlite3
- [ ] Create src/db/connection.ts with a connection manager class
- [ ] Support file-based databases (using MOB_DATA_DIR path)
- [ ] Support in-memory databases (for testing and forgetful mode)
- [ ] Enable WAL mode and foreign keys pragma
- [ ] Create test helper that provides in-memory database instances