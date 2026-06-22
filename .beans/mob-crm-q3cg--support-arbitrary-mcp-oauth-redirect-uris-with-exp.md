---
# mob-crm-q3cg
title: Support arbitrary MCP OAuth redirect URIs with explicit consent
status: completed
type: bug
priority: critical
created_at: 2026-06-22T04:11:42Z
updated_at: 2026-06-22T04:15:08Z
---

MCP desktop clients may use arbitrary custom-scheme redirect URIs (for example joey://mcp-oauth/callback). Replace redirect URI allow-listing with explicit user consent that shows the exact client_id and redirect_uri after login and before minting an authorization code. Keep S256 PKCE required, require syntactically valid absolute redirect URIs, and add tests for custom-scheme redirects and consent-required behavior.