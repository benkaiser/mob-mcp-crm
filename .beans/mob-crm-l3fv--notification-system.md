---
# mob-crm-l3fv
title: Notification System
status: completed
type: epic
priority: normal
created_at: 2026-02-09T00:06:11Z
updated_at: 2026-02-09T00:49:09Z
parent: mob-crm-d92t
---

Implement the notification system.

## Scope
- Notifications table migration
- Notification types: birthday, reminder, follow_up, custom
- Notification generation from reminders and birthday proximity (7 days)
- Session-connect notification delivery (check and send pending notifications when user connects)
- Notification service: list, create, mark_read, mark_all_read
- MCP tools: notification_list, notification_read, notification_read_all, notification_create
- Integration tests for generation triggers and delivery