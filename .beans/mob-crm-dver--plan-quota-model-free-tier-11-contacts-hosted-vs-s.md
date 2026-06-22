---
# mob-crm-dver
title: Plan & quota model (free tier 11 contacts; hosted-vs-self-hosted gating)
status: completed
type: feature
priority: critical
created_at: 2026-05-29T13:47:22Z
updated_at: 2026-05-29T14:01:59Z
parent: mob-crm-yhfl
---

Introduce a plan/quota concept and feature-gating that is ONLY active in hosted/production mode. In open-source / self-hosted mode, EVERYTHING is unlimited and ungated by default.

## Critical mode distinction
- **Self-hosted / open-source (default):** plan = "unlimited", no contact cap, public API + webhooks + all advanced features available. No gating anywhere.
- **Hosted / production mode** (enabled via config/env, e.g. `MOB_HOSTED=true`): users default to FREE plan = max 11 contacts, full web UI, but NO public REST API / webhooks / advanced features. Paid plan lifts the cap + unlocks API/webhooks.

## Design
- Config flag `hosted` on ServerConfig (from env). When false -> all gating no-ops.
- Migration `010-plans.sql`: add `plan` to users (default 'unlimited' self-hosted, 'free' hosted on signup) + optional `plans`/`entitlements` reference; track plan + limits.
- `PlanService`: getPlan(userId), getEntitlements(plan) -> { contactCap, publicApi, webhooks, advancedImport, ... }, isFeatureEnabled(userId, feature).
- Quota middleware/helper: `enforceContactQuota(userId)` called by contact create paths (web API, public API, import). When over cap -> structured 402/403 error with upgrade messaging. No-op when not hosted or plan unlimited.
- Feature-gate middleware: `requireFeature('public_api'|'webhooks'|...)` -> no-op unless hosted + plan lacks feature.
- Usage helper: `getUsage(userId)` -> { contacts: n, contactCap } for dashboard display.

## Checklist
- [x] `hosted` config flag from env, threaded into ServerConfig
- [x] Migration 010-plans.sql (users.plan + entitlements)
- [x] PlanService (getPlan/getEntitlements/isFeatureEnabled/getUsage)
- [x] enforceContactQuota helper (used by all contact-create paths)
- [x] requireFeature gating middleware (no-op when self-hosted)
- [x] Default plan logic: unlimited self-hosted, free on hosted signup
- [x] Tests: self-hosted = no limits; hosted free = 11-cap enforced on create + import + public API; hosted paid = unlimited; feature gates on/off per mode
