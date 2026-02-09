---
# mob-crm-aq0e
title: MCP Server & SSE Transport
status: todo
type: epic
priority: high
created_at: 2026-02-09T00:05:36Z
updated_at: 2026-02-09T00:06:43Z
parent: mob-crm-bkbs
blocking:
    - mob-crm-ek4t
---

Set up the MCP server with SSE transport.

## Scope
- Install @modelcontextprotocol/sdk
- Configure MCP server with SSE transport
- Set up HTTP server (Express or raw http) to serve SSE endpoint at /mcp
- Implement session management
- Server startup with configurable port
- Graceful shutdown handling