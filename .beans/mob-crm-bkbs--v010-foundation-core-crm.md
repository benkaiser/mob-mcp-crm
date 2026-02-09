---
# mob-crm-bkbs
title: v0.1.0 — Foundation & Core CRM
status: in-progress
type: milestone
priority: high
created_at: 2026-02-09T00:05:08Z
updated_at: 2026-02-09T00:11:09Z
blocking:
    - mob-crm-8o31
---

The first milestone: get the project scaffolded, database running, auth working, and core contact CRUD operational with tests. This milestone represents a working MCP server that can create, read, update, and delete contacts.

## Goals
- Project scaffolding (TypeScript, Node.js, Vitest, dev server with auto-reload)
- SQLite database with migrations
- MCP server running with Streamable HTTP transport
- OAuth PKCE authentication flow
- Core contact CRUD (create, read, update, delete, list, search)
- Contact sub-entities (contact methods, addresses, food preferences, custom fields)
- Comprehensive tests for all of the above
- Homepage serving at /