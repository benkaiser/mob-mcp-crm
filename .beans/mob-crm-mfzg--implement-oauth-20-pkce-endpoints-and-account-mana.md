---
# mob-crm-mfzg
title: Implement OAuth 2.0 PKCE endpoints and account management
status: todo
type: task
priority: high
created_at: 2026-02-09T00:07:12Z
updated_at: 2026-02-09T00:07:12Z
parent: mob-crm-ek4t
---

Build the OAuth PKCE flow and account creation.

## Checklist
- [ ] Create src/auth/oauth.ts — authorization endpoint, token endpoint
- [ ] Implement PKCE code_challenge / code_verifier verification
- [ ] Accept any client_id without registration
- [ ] Create src/auth/accounts.ts — account creation (name, email, password)
- [ ] Hash passwords with bcrypt
- [ ] Login endpoint returning authorization code
- [ ] Token issuance and validation
- [ ] Log all authorizations to authorization_log table
- [ ] Create auth middleware for protecting MCP tool calls
- [ ] Wire OAuth endpoints into Express app
- [ ] Integration tests for: account creation, login, OAuth flow, token validation, duplicate email rejection