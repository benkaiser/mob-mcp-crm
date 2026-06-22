---
# mob-crm-lpge
title: Unified auth bridge (web login <-> MCP token)
status: completed
type: feature
priority: high
created_at: 2026-05-29T13:47:22Z
updated_at: 2026-05-29T14:06:53Z
parent: mob-crm-yhfl
---

Make web and MCP one identity instead of parallel universes. A logged-in web user can connect their AI assistant (mint/authorize MCP tokens) without re-entering credentials, and an MCP OAuth login can drop the user into the web session.

## Design
- "Connect your AI assistant" flow from web settings: an authenticated web session can authorize an MCP OAuth client (skip the password step — reuse the existing /auth/authorize but accept a valid web session as proof of identity), issuing an auth code -> token.
- Reverse: after MCP OAuth login in the browser, optionally set the `mob_session` cookie too (so the same browser is logged into the web app). Reuse existing auto-login token machinery.
- Ensure both paths converge on SessionService + accountService; one user row.
- Keep forgetful mode unaffected.

## Checklist
- [x] Web-session-authenticated path through /auth/authorize (no re-login) to mint MCP code
- [x] Settings UI affordance "Connect AI assistant" (page or section; final UI may live in epic 6 settings — stub endpoint here)
- [x] Browser MCP login optionally sets web session cookie
- [x] Tests: web session -> MCP code -> token exchange; MCP browser login -> web cookie set; no cross-user leakage
