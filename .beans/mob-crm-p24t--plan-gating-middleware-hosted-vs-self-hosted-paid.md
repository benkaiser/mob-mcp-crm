---
# mob-crm-p24t
title: Plan-gating middleware (hosted vs self-hosted; paid-only public API)
status: completed
type: task
priority: normal
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-b6eq
---

Gate the entire public API + webhooks behind paid plan in hosted mode; fully open self-hosted.

## Design
- Apply requireFeature('public_api') (from epic 1 PlanService) to all /api/v1 routes and webhook management.
- Self-hosted (hosted=false) -> always allowed. Hosted free -> 402/403 with upgrade message. Hosted paid -> allowed.

## Checklist
- [x] Mount requireFeature('public_api') on /api/v1 + webhooks
- [x] 402/403 upgrade messaging in hosted free
- [x] Tests: self-hosted open; hosted free blocked; hosted paid open
