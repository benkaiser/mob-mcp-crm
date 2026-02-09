---
# mob-crm-ek4t
title: OAuth PKCE Authentication
status: todo
type: epic
priority: high
created_at: 2026-02-09T00:05:38Z
updated_at: 2026-02-09T00:06:43Z
parent: mob-crm-bkbs
blocking:
    - mob-crm-uq5p
---

Implement OAuth 2.0 with PKCE flow for MCP authentication.

## Scope
- Implement OAuth authorization endpoint
- Implement token endpoint with PKCE verification
- Accept any client_id (no client registration)
- Log all authorizations (client_id, IP, user agent, timestamp)
- Account creation endpoint (name, email, password with bcrypt)
- Login endpoint
- Token validation middleware
- Session-to-user mapping
- Users table migration
- Authorization log table migration