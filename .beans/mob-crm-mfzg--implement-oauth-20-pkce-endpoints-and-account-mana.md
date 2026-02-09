---
# mob-crm-mfzg
title: Implement OAuth 2.0 PKCE endpoints and account management
status: completed
type: task
priority: high
created_at: 2026-02-09T00:07:12Z
updated_at: 2026-02-09T00:36:00Z
parent: mob-crm-ek4t
---

Build the OAuth PKCE flow and account creation.

## Checklist
- [x] Create src/auth/oauth.ts — authorization endpoint, token endpoint
- [x] Implement PKCE code_challenge / code_verifier verification
- [x] Accept any client_id without registration
- [x] Create src/auth/accounts.ts — account creation (name, email, password)
- [x] Hash passwords with bcrypt
- [x] Login endpoint returning authorization code
- [x] Token issuance and validation
- [x] Log all authorizations to authorization_log table
- [x] Create auth middleware for protecting MCP tool calls
- [x] Wire OAuth endpoints into Express app
- [x] Integration tests for: account creation, login, OAuth flow, token validation, duplicate email rejection
