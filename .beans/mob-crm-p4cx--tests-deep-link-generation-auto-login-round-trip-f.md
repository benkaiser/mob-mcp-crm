---
# mob-crm-p4cx
title: 'Tests: deep-link generation + auto-login round-trip + forgetful'
status: completed
type: task
priority: low
created_at: 2026-05-29T13:51:56Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-hq5x
---

Consolidated test coverage for the continuity feature (some overlap with sibling beans; this ensures end-to-end coverage).

## Checklist
- [x] Deep-link builder unit tests (all entity types)
- [x] Auto-login token consumed -> authenticated web session -> correct redirect (integration)
- [x] Forgetful-mode behavior verified
- [x] Regression: wired MCP tools still pass existing tests
