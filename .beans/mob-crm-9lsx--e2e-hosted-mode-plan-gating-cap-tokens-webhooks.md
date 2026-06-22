---
# mob-crm-9lsx
title: 'E2E: Hosted-mode plan gating (cap, tokens, webhooks)'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T13:28:20Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/plan-gating.spec.ts. Owns: tests/e2e/plan-gating.spec.ts + any hosted-mode harness wiring agreed with the harness bean. Requires the hosted-mode webServer toggle (MOB_HOSTED=true).

Hosted mode plan-gating (depends on harness exposing a hosted project/config):
- Free plan: contact cap (11) enforced — seed 11, attempt a 12th via UI → blocked with upgrade/cap message.
- Free plan: API tokens section blocked/403 (Settings shows gated state).
- Free plan: webhooks blocked/403.
- Paid plan: tokens + webhooks allowed; no contact cap.
Use API seeding to set plan where needed, or register accounts with specific plans.

## Checklist
- [x] Free: contact cap blocks the over-cap contact (API 402 + SPA contact-form ErrorBanner). Note: cap is 11 *including* the auto-created is_me self-contact, so the spec seeds 10 then asserts the 11th-additional is rejected.
- [x] Free: tokens gated (Settings UpgradeNotice + POST /tokens 403)
- [x] Free: webhooks gated (Settings UpgradeNotice + POST /webhooks 403)
- [x] Paid: tokens + webhooks allowed — WONTFIX (test.skip retained). No web-API/route seam exists to upgrade a free account to paid (plan is the `users.plan` DB column; PlanService has no setPlan and no route mounts one). User decided 2026-05-30 to ship as-is rather than add a test-only or real upgrade seam.
- [x] Paid: no contact cap — WONTFIX (same reason; covered by the same retained test.skip).
