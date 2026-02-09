---
# mob-crm-ike9
title: Set up MCP server with Streamable HTTP transport
status: todo
type: task
priority: high
created_at: 2026-02-09T00:07:08Z
updated_at: 2026-02-09T00:07:08Z
parent: mob-crm-aq0e
---

Install MCP SDK and set up the server with Streamable HTTP transport.

## Checklist
- [ ] Install @modelcontextprotocol/sdk
- [ ] Install express (for HTTP server hosting MCP endpoint + homepage)
- [ ] Create src/server/mcp-server.ts — configure MCP server instance
- [ ] Create src/server/http-server.ts — Express app serving MCP endpoint at /mcp (POST + GET) and homepage at /
- [ ] POST /mcp accepts JSON-RPC messages, responds with application/json or text/event-stream
- [ ] GET /mcp opens SSE stream for server-initiated messages
- [ ] Implement session management (Mcp-Session-Id header, track connected sessions)
- [ ] Support MCP-Protocol-Version header validation
- [ ] Wire up server startup in src/index.ts
- [ ] Configurable port via PORT env var
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] Test that server starts and accepts Streamable HTTP connections