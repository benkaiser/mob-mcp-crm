---
# mob-crm-b6eq
title: 'Epic: Public REST API + API tokens + webhooks (plan-gated)'
status: completed
type: epic
priority: normal
created_at: 2026-05-29T13:46:14Z
updated_at: 2026-05-29T15:31:40Z
parent: mob-crm-ehb6
---

A versioned public REST API (`/api/v1`) authenticated by API tokens, plus outbound webhooks. This is a PAID/advanced feature in hosted mode; in self-hosted mode it's fully available. Separate surface from the internal SPA API.

## Goals
- API token model: generate/list/revoke tokens (hashed at rest, shown once), scopes, last-used tracking. Managed from web settings.
- `/api/v1/*` REST endpoints over the shared services covering all major entities (contacts, sub-entities, activities, life events, notes, reminders, gifts, debts, tasks, tags, search, export). Consistent JSON envelope, pagination, errors, rate-limiting.
- Plan-gating middleware: in hosted mode the public API + webhooks require a paid plan; in self-hosted mode always available.
- Webhooks: subscribe to events (contact.created, reminder.due, activity.created, etc.), signed payloads (HMAC), delivery log + retry.
- OpenAPI/Swagger doc generated or hand-authored; published at /api/v1/docs.

## Children
- API token model (migration, service, settings UI to create/list/revoke)
- Public API auth middleware + rate limiting + error envelope + versioning
- Plan-gating middleware (hosted vs self-hosted; paid-only public API)
- /api/v1 entity endpoints — contacts + sub-entities
- /api/v1 entity endpoints — activities, life events, notes, reminders, timeline
- /api/v1 entity endpoints — gifts, debts, tasks, tags, search, export
- Webhooks: subscription model + signed delivery + retry + log
- Webhooks: settings UI (subscribe/manage/test) + delivery log view
- OpenAPI spec + /api/v1/docs page

Blocked by Epic 1.
