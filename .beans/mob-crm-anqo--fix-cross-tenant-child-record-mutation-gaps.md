---
# mob-crm-anqo
title: Fix cross-tenant child record mutation gaps
status: completed
type: bug
priority: critical
created_at: 2026-06-22T03:03:24Z
updated_at: 2026-06-22T03:51:05Z
---

Public beta blocker: several web/public API child update/delete routes verify the parent contact but mutate child rows by child ID only. Add service/route methods that constrain mutations by userId + parent contactId + child ID using joins, covering contact methods, addresses, custom fields, relationships, and analogous child resources. Add cross-user regression tests.