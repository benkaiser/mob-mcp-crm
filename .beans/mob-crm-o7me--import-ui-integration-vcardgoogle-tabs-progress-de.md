---
# mob-crm-o7me
title: Import UI integration (vCard/Google tabs + progress + dedup report)
status: completed
type: task
priority: low
created_at: 2026-05-29T13:51:38Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-bd9r
---

Wire the new importers into the SPA import host (epic 6) with good UX.

## Design
- Add vCard + Google CSV tabs to the import page; file pickers; submit to the respective endpoints.
- Show progress + result summary (per-entity counts, warnings, skipped duplicates, quota-skips with upgrade hint on hosted free).

## Checklist
- [x] vCard + Google tabs wired to endpoints in import host
- [x] Progress + result summary + dedup/quota reporting
- [x] Tests: UI render + submit flow (mocked)
