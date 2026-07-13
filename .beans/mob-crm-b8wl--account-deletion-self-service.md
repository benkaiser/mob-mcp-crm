---
# mob-crm-b8wl
title: Account deletion (self-service)
status: completed
type: feature
priority: high
created_at: 2026-07-12T23:50:27Z
updated_at: 2026-07-13T00:38:51Z
parent: mob-crm-rqef
---

Users cannot delete their own account. Add a self-service deletion path (important for trust/GDPR during beta).

## Requirements
- Danger Zone in Settings: 'Delete account' with a confirmation modal requiring the user to type their email (or re-enter password) to confirm.
- `DELETE /web/api/account` (session + CSRF), requiring password re-auth in the body.
- `AccountService.deleteAccount(userId)`:
  - Purge or soft-delete all user-owned data (contacts + all sub-entities, activities, notes, reminders, tasks, gifts, debts, life events, tags, settings, api tokens, webhooks, oauth_tokens, sessions, auto_login_tokens). Soft-deleted primary entities use `deleted_at`, but account deletion should HARD-remove PII — decide and document: recommend hard delete of the user row + cascading hard delete of owned rows for a genuine 'delete my data'.
  - Do it in a transaction.
- Revoke all web sessions and OAuth tokens, then clear the session cookie and redirect to a 'your account has been deleted' page.
- Send a confirmation email (optional, if email infra present).

## Files
- `AccountService.deleteAccount`; account api router; `web/src/pages/Settings.tsx` Danger Zone; possibly a shared 'purge user data' helper.

## Checklist
- [x] AccountService.deleteAccount (transactional purge of all owned data + tokens/sessions)
- [x] DELETE /web/api/account route with password re-auth
- [x] Settings Danger Zone + confirm modal
- [x] Clear cookie + redirect after deletion
- [x] Tests: full data purge, wrong password rejected, cross-tenant isolation