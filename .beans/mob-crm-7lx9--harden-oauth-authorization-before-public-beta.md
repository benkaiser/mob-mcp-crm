---
# mob-crm-7lx9
title: Harden OAuth authorization before public beta
status: completed
type: bug
priority: critical
created_at: 2026-06-22T03:03:24Z
updated_at: 2026-06-22T03:51:04Z
---

Public beta blocker: /auth/authorize currently accepts arbitrary client_id and redirect_uri, and the web-session bridge can mint MCP authorization codes for arbitrary clients. Add registered/trusted OAuth clients or exact redirect URI allow-listing, require S256 PKCE, add an explicit consent screen showing the client, and add tests for malicious redirect/client attempts.