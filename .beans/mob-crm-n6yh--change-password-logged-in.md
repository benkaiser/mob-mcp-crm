---
# mob-crm-n6yh
title: Change password (logged in)
status: completed
type: feature
priority: high
created_at: 2026-07-12T23:49:48Z
updated_at: 2026-07-13T00:38:51Z
parent: mob-crm-rqef
---

Logged-in users cannot change their password from Settings. Add a change-password control.

## Requirements
- `POST /web/api/account/password` (session-authed, CSRF-protected) with `{ current_password, new_password }`.
- `AccountService.changePassword(userId, current, next)`: verify current with bcrypt.compare, hash and store new. Throw typed error on mismatch.
- Settings UI: a 'Security' / 'Password' section with current + new + confirm fields, using existing form components and toast feedback.
- Enforce a minimum password length consistent with signup.

## Files
- `src/server/web-api/` new `account.ts` router (mounted at `/account`) or extend existing; `AccountService`; `web/src/pages/Settings.tsx`; `web/src/api/settings.ts` (or new account api module).

## Checklist
- [x] AccountService.changePassword (verify current, set new)
- [x] POST /web/api/account/password route (CSRF + session)
- [x] Settings 'Password' section UI + client call
- [x] Tests: success, wrong current password, too-short new password