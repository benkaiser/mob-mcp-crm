---
# mob-crm-rbdk
title: Password reset (forgot password) flow
status: completed
type: feature
priority: high
created_at: 2026-07-12T23:49:48Z
updated_at: 2026-07-13T00:38:51Z
parent: mob-crm-rqef
---

Users who forget their password have no recovery path today. Add a standard token-based reset flow.

## Flow
1. `/auth/forgot` page (EJS, styled like login/register): user enters email.
2. Server generates a single-use, expiring (e.g. 1h) reset token, stores a hash of it in a new `password_reset_tokens` table (token_hash, user_id, expires_at, used_at). Always respond with a generic success message regardless of whether the email exists (no account enumeration).
3. Email the reset link via EmailService: `/auth/reset?token=...`.
4. `/auth/reset` page: enter + confirm new password. Validate token (exists, unexpired, unused), update `password_hash` (bcrypt), mark token used, and optionally revoke existing web sessions.
5. Rate-limit requests per email/IP.

## Depends on
- Email delivery infrastructure (SMTP).

## Files
- New migration for `password_reset_tokens`.
- `AccountService`: `createPasswordResetToken(email)`, `resetPassword(token, newPassword)`.
- Routes in `src/server/http-server.ts`; views `forgot.ejs`, `reset.ejs`; link from `login.ejs`/`web-login.ejs`.

## Checklist
- [x] Migration: password_reset_tokens (hashed, expiring, single-use)
- [x] AccountService reset token create/consume methods
- [x] /auth/forgot page + POST handler (generic response, rate-limited)
- [x] /auth/reset page + POST handler (validate + set new password)
- [x] Reset email template + send
- [x] 'Forgot password?' link on login pages
- [x] Integration tests (happy path, expired, reused, unknown email)