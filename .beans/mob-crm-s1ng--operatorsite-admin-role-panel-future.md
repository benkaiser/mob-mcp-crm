---
# mob-crm-s1ng
title: Operator/site-admin role & panel (future)
status: draft
type: feature
priority: low
created_at: 2026-07-12T23:50:40Z
updated_at: 2026-07-12T23:50:40Z
---

High-level placeholder for a future operator/site-admin capability, distinct from user account self-service. Today there is no admin role, superuser, or any way for an operator to manage the platform beyond direct DB/SQLite access.

## Motivation
As the hosted beta grows (support via mobsupport@benkaiser.dev), we'll want operator tooling to handle support requests, abuse, and platform health without touching the database by hand.

## Possible scope (to refine before building)
- `is_admin`/role column on users + auth guard for admin-only routes.
- Admin panel (separate SPA area or EJS): list/search users, view plan & usage, disable/suspend, delete on request.
- Impersonation / 'view as user' for support (with audit log).
- Beta invite management / allowlist.
- Platform metrics (signups, active users, storage) and audit log of admin actions.
- Broadcast/announcement or maintenance banner.

## Notes
- Needs careful security review (privilege escalation, audit trail, PII access).
- Keep separate from the account self-service epic (mob-crm-rqef).
- Refine into an epic + child beans when prioritised.