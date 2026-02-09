---
# mob-crm-ike9
title: Set up MCP server with Streamable HTTP transport
status: completed
type: task
priority: high
created_at: 2026-02-09T00:07:08Z
updated_at: 2026-02-09T00:32:00Z
parent: mob-crm-aq0e
---

Install MCP SDK and set up the server with Streamable HTTP transport.

## Checklist
- [x] Install @modelcontextprotocol/sdk
- [x] Install express (for HTTP server hosting MCP endpoint + homepage)
- [x] Create src/server/mcp-server.ts — configure MCP server instance
- [x] Create src/server/http-server.ts — Express app serving MCP endpoint at /mcp (POST + GET) and homepage at /
- [x] POST /mcp accepts JSON-RPC messages, responds with application/json or text/event-stream
- [x] GET /mcp opens SSE stream for server-initiated messages
- [x] Implement session management (Mcp-Session-Id header, track connected sessions)
- [x] Support MCP-Protocol-Version header validation
- [x] Wire up server startup in src/index.ts
- [x] Configurable port via PORT env var
- [x] Graceful shutdown on SIGTERM/SIGINT
- [x] Test that server starts and accepts Streamable HTTP connections
