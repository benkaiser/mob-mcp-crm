---
# mob-crm-ike9
title: Set up MCP server with SSE transport and HTTP server
status: todo
type: task
priority: high
created_at: 2026-02-09T00:07:08Z
updated_at: 2026-02-09T00:07:08Z
parent: mob-crm-aq0e
---

Install MCP SDK and set up the server with SSE transport.

## Checklist
- [ ] Install @modelcontextprotocol/sdk
- [ ] Install express (for HTTP server hosting SSE + homepage)
- [ ] Create src/server/mcp-server.ts — configure MCP server instance
- [ ] Create src/server/http-server.ts — Express app serving SSE at /mcp and homepage at /
- [ ] Implement session management (track connected sessions)
- [ ] Wire up server startup in src/index.ts
- [ ] Configurable port via PORT env var
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] Test that server starts and accepts SSE connections