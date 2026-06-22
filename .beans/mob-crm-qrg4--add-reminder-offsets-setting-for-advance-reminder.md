---
# mob-crm-qrg4
title: Add reminder_offsets setting for advance reminder notifications
status: completed
type: feature
priority: normal
created_at: 2026-06-21T23:59:51Z
updated_at: 2026-06-22T00:12:44Z
---

Add a new user setting 'reminder_offsets' (separate from birthday_reminder_offsets), defaulting to [0,7,30], that controls how many days in advance custom reminder push notifications fire. Currently runReminderScheduler only fires on/after due date. Mirror the birthday offset behavior for reminders.