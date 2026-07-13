---
# mob-crm-ryph
title: Manage connected AI assistants (OAuth clients)
status: todo
type: feature
priority: normal
created_at: 2026-07-12T23:50:27Z
updated_at: 2026-07-12T23:50:49Z
parent: mob-crm-rqef
---

Users connect AI assistants via OAuth PKCE, but there's no way to see or revoke those connections after the fact. Give them visibility and control.

## Requirements
- List the user's active OAuth tokens (`oauth_tokens` table) grouped by client_id, showing client name (if known), created_at, expiry/last-seen.
- `GET /web/api/account/connections` and `DELETE /web/api/account/connections/:id` (or by client) that call `OAuthService.revokeToken`/a new `revokeTokensForClient(userId, clientId)`.
- Settings 'Connected AI assistants' section listing connections with a Revoke button; revoking immediately invalidates that assistant's MCP access.
- Ensure revocation is scoped to the current user (cross-tenant safety).

## Files
- `src/auth/oauth.ts` (list/revoke-by-user helpers); account api router; `web/src/pages/Settings.tsx` section + api module.

## Checklist
- [ ] OAuthService: listConnectionsForUser + revoke by id/client (user-scoped)
- [ ] GET/DELETE /web/api/account/connections routes
- [ ] Settings 'Connected AI assistants' UI + revoke
- [ ] Tests: list only own tokens, revoke invalidates access, cross-tenant denied