---
# mob-crm-1czo
title: Add signup/login abuse protection for public beta
status: scrapped
type: task
priority: high
created_at: 2026-06-22T03:03:24Z
updated_at: 2026-06-22T03:39:52Z
---

Before opening free signups, add abuse controls around /auth/register, /web/login, /auth/authorize, and /auth/token: per-IP and per-account rate limits, lockout/backoff for repeated login failures, body-size limits appropriate to each route, clear audit logging, and tests for throttling behavior.