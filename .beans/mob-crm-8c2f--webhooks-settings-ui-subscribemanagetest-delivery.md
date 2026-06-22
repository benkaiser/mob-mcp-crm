---
# mob-crm-8c2f
title: 'Webhooks: settings UI (subscribe/manage/test) + delivery log'
status: completed
type: feature
priority: low
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-b6eq
---

Web UI to manage webhook subscriptions and inspect deliveries.

## Design
- Internal API: CRUD webhook subscriptions (url, event selection, active toggle, regenerate secret) + list recent deliveries + "send test event".
- UI (settings): subscriptions list + add/edit (url + event checkboxes) + reveal/regenerate secret + test button; delivery log (event, status, code, time, retry).
- Gated like the rest of the public platform in hosted mode.

## Checklist
- [x] Webhook subscription CRUD internal API + test-event endpoint
- [x] Settings UI (subscriptions + secret + test)
- [x] Delivery log view
- [x] Tests: subscription CRUD; test event delivery; render
