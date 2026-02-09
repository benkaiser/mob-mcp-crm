---
# mob-crm-7ygq
title: Tags & Groups
status: todo
type: epic
priority: normal
created_at: 2026-02-09T00:05:51Z
updated_at: 2026-02-09T00:05:51Z
parent: mob-crm-8o31
---

Implement tags and groups for contact organization.

## Scope
- Tags table and contact_tags junction table migration
- Groups table and contact_groups junction table migration
- Tag service: create, update, delete, list; contact_tag, contact_untag
- Group service: create, get, update, delete, list; add_member, remove_member
- Tags created on-the-fly when first used
- MCP tools for both tags and groups
- Integration tests