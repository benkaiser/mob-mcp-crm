---
# mob-crm-yhfl
title: 'Epic: Foundation — durable sessions, unified auth, plan/quota, internal API'
status: completed
type: epic
priority: critical
created_at: 2026-05-29T13:45:11Z
updated_at: 2026-05-29T14:07:23Z
parent: mob-crm-ehb6
---

The keystone epic. Nothing else is safe to build until the web has a durable session store, a unified auth model, a plan/quota concept, and an internal JSON API convention. Everything downstream rides on this.

## Goals
- Replace in-memory `webSessions` Map with a durable `sessions` table.
- Unify auth: web login can mint MCP tokens and vice versa; single user identity.
- Introduce a `plan` concept + quota enforcement (free tier = 11 contacts) + feature-gating middleware (self-hosted defaults to unlimited).
- Establish the internal JSON API surface (`/web/api/*`) conventions: session auth, error envelope, validation (zod), pagination, CSRF.

## Children
- Durable session store (migration + service + middleware refactor)
- Plan & quota model (migration, PlanService, quota middleware, contact-cap enforcement)
- Internal JSON API conventions + router skeleton (error envelope, zod validation, CSRF, pagination helpers)
- Unified auth bridge (web<->MCP token linking)

See child beans for detail. This epic blocks epics 2-9.
