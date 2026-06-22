---
# mob-crm-swbh
title: Enforce hosted free-tier quotas across MCP and imports
status: completed
type: bug
priority: high
created_at: 2026-06-22T03:03:24Z
updated_at: 2026-06-22T03:51:05Z
---

Public beta blocker: hosted free-tier contact quotas are enforced in web/public contact creation and the vCard/Google import pipeline, but MCP contact_create and batch_create_contacts currently instantiate ContactService directly with no PlanService gate, and Monica import is a destructive whole-account path with no quota/feature gate. Wire hosted plan enforcement through MCP creation paths and import paths, or explicitly disable/gate quota-bypassing surfaces for hosted free beta.