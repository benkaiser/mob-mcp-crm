---
# mob-crm-z04s
title: Skip Monica auto-generated birthday reminders on import
status: completed
type: task
priority: normal
created_at: 2026-06-22T00:05:59Z
updated_at: 2026-06-22T00:12:44Z
---

Monica auto-creates non-deletable (delible=0) reminders for special dates like birthdays. Mob has its own birthday notification system driven by contact birthday fields, so importing these creates duplicate noise. Skip reminders where delible=0 during Monica import.