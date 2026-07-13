---
# mob-crm-y8ef
title: Edit profile (name, email, timezone)
status: todo
type: feature
priority: normal
created_at: 2026-07-12T23:49:48Z
updated_at: 2026-07-12T23:50:49Z
parent: mob-crm-rqef
---

The Settings profile section is read-only (name/email/plan). Let users edit their name, email, and timezone.

## Requirements
- `PATCH /web/api/account/profile` (session + CSRF) accepting partial `{ name, email, timezone }`.
- Name/timezone update immediately. Timezone updates `user_settings` (see 007-user-settings migration) and should keep notification scheduling consistent.
- **Email change** should go through verification (see 'Email verification' bean): update to a pending email + send confirmation, only swap on confirm. If that bean isn't done yet, gate email editing behind it or require re-auth; do not silently change the login email without verification.
- Update the active web session's cached name/email after a successful change.
- Validate uniqueness of email (reuse createAccount's duplicate check).

## Files
- `AccountService.updateProfile`; `UserSettingsService` for timezone; `web/src/pages/Settings.tsx` (editable form); account api module.

## Checklist
- [ ] AccountService.updateProfile (name/timezone; email via verification)
- [ ] PATCH /web/api/account/profile route
- [ ] Settings editable profile form + client call
- [ ] Refresh session cache (name/email) after update
- [ ] Tests: name/timezone update, duplicate email rejected