---
# mob-crm-rjqb
title: Email verification (signup + email change)
status: completed
type: feature
priority: normal
created_at: 2026-07-12T23:50:27Z
updated_at: 2026-07-13T00:38:51Z
parent: mob-crm-rqef
blocking:
    - mob-crm-y8ef
---

Emails are currently unverified. Add verification so we can trust addresses (needed for reliable password reset and to reduce abuse in beta).

## Requirements
- Add `email_verified_at` to users (migration) and an `email_verification_tokens` table (hashed, expiring, single-use), plus optional `pending_email` column for email changes.
- On signup: create the account, send a verification email with a link `/auth/verify?token=...`. Do NOT hard-block login initially (beta) — instead surface an 'unverified' banner in the SPA and allow resending. (Decide whether to gate sensitive actions later.)
- `/auth/verify` route consumes the token and sets `email_verified_at` (or swaps `pending_email` -> `email` for change flows).
- 'Resend verification email' endpoint + Settings/banner control, rate-limited.
- Ties into 'Edit profile' email-change flow: changing email sets `pending_email` and sends verification; email swaps only on confirm.

## Depends on
- Email delivery infrastructure (SMTP).

## Files
- Migration(s); `AccountService` verify/resend methods; routes in http-server; SPA banner + resend control.

## Checklist
- [x] Migration: email_verified_at + pending_email + email_verification_tokens
- [x] Send verification email on signup
- [x] /auth/verify route (consume token, set verified / swap pending email)
- [x] Resend verification endpoint (rate-limited) + SPA banner
- [x] Tests: verify happy path, expired/reused token, resend, email-change swap