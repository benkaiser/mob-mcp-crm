---
# mob-crm-nigh
title: Tasks
status: todo
type: epic
priority: normal
created_at: 2026-02-09T00:06:15Z
updated_at: 2026-02-09T00:06:15Z
parent: mob-crm-d92t
---

Implement task tracking.

## Scope
- Tasks table migration
- Optional contact linking
- Fields: title, description, due_date, priority (low/medium/high), status (pending/in_progress/completed)
- Task service: create, get, update, soft-delete, complete, list (filterable by contact, status, priority)
- MCP tools: task_list, task_create, task_update, task_complete, task_delete
- Integration tests