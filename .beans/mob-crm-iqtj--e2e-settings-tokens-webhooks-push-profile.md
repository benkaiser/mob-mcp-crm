---
# mob-crm-iqtj
title: 'E2E: Settings (tokens, webhooks, push, profile)'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:33:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/settings.spec.ts. Owns: web/src/pages/Settings.tsx, tests/e2e/settings.spec.ts. Add testids to Settings sections (profile, plan, tokens, webhooks, push).

Self-hosted mode (default harness):
- Profile section shows name/email/plan.
- API tokens: create a token → plaintext shown once → appears masked in list → revoke removes it.
- Webhooks: create a webhook (url + events) → appears in list → toggle active → delete. Test event button if present.
- Push notifications section renders (subscribe likely unavailable without VAPID in CI — just assert the UI state, don't require a real subscription).

## Checklist
- [x] Profile/plan displayed
- [x] Token create → shown once → masked → revoke
- [x] Webhook create → list → toggle → delete
- [x] Push section renders gracefully without VAPID
