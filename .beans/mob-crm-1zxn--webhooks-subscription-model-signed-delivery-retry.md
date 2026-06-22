---
# mob-crm-1zxn
title: 'Webhooks: subscription model + signed delivery + retry + log'
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-b6eq
---

Outbound webhooks for key events.

## Design
- Migration: webhook_subscriptions(id,user_id,url,events[],secret,active,created_at), webhook_deliveries(id,subscription_id,event,payload,status,attempts,response_code,created_at,delivered_at).
- Event emitter hook in services or a thin event bus: emit on contact.created/updated/deleted, reminder.due, activity.created, gift.*, debt.* etc. (start with a core set).
- Delivery: POST signed payload (HMAC-SHA256 of body with subscription secret in X-Mob-Signature). Retry with backoff (e.g., 3-5 attempts); record deliveries.
- Background worker/interval to process the delivery queue + retries (fold into existing interval infra).
- Paid/self-hosted gating (epic 1).

## Checklist
- [x] Migrations for subscriptions + deliveries
- [x] Event emission points (core events)
- [x] Signed delivery (HMAC) + retry/backoff + delivery log
- [x] Queue processor wired into interval infra
- [x] Tests: subscription CRUD, signature correctness, retry on failure, delivery logging
