---
# mob-crm-rqef
title: 'Epic: Account self-service (password, profile, deletion, sessions)'
status: todo
type: epic
priority: high
created_at: 2026-07-12T23:48:58Z
updated_at: 2026-07-12T23:49:06Z
parent: mob-crm-ehb6
---

Users can currently sign up, log in, log out and connect AI assistants via OAuth, but they have no way to manage their own account after that. The Settings page shows name/email/plan read-only. This epic covers the account self-service gaps so users aren't dependent on mobsupport@benkaiser.dev for routine account operations.

## Scope
- Password reset / forgot-password flow
- Change password while logged in
- Edit profile (name, email, timezone)
- Account deletion (self-service, purges/soft-deletes all data)
- Email verification (signup + email change)
- Manage connected AI assistants (list/revoke OAuth tokens)
- Manage active web sessions (list/revoke/logout-everywhere)

## Foundational dependency
Email delivery infrastructure (SMTP via nodemailer) must land first — it blocks password reset and email verification.

## Notes
- We are in beta; all features free for everyone, support via mobsupport@benkaiser.dev.
- Data export/download is already covered by the DataExport page (/web/api/export).