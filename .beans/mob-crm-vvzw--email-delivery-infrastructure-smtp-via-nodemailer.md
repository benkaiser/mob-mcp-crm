---
# mob-crm-vvzw
title: Email delivery infrastructure (SMTP via nodemailer)
status: completed
type: feature
priority: high
created_at: 2026-07-12T23:49:19Z
updated_at: 2026-07-13T00:38:51Z
parent: mob-crm-rqef
blocking:
    - mob-crm-rbdk
    - mob-crm-rjqb
---

There is currently no way for Mob to send email. This is a hard prerequisite for password reset and email verification. Build a small, provider-agnostic email service using **nodemailer** over SMTP so it works with any provider (self-hosted, Gmail, Mailgun SMTP, Postmark SMTP, etc.).

## Requirements
- Add `nodemailer` dependency.
- New `src/services/email.ts` `EmailService` with a `sendMail({ to, subject, text, html })` method.
- Config via env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (e.g. "Mob <no-reply@benkaiser.dev>").
- Graceful behaviour when SMTP is not configured (self-hosted dev): log a warning and no-op (or log the email to console) rather than crashing. Tests must not require a live SMTP server.
- Reusable HTML/text templating helper (simple, no heavy dependency) for transactional emails.
- Wire config into the existing config loader.

## Testing
- Unit test with a nodemailer mock/stub transport (`jsonTransport` or a stub) verifying subject/to/body composition and that unconfigured SMTP no-ops safely.

## Checklist
- [x] Add nodemailer dependency
- [x] EmailService with SMTP transport + config
- [x] Safe no-op when SMTP unconfigured
- [x] Transactional email template helper
- [x] Config/env wiring + docs (README/AGENTS or FEATURES)
- [x] Unit tests with mock transport