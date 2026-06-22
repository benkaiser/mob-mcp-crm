import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import http from 'node:http';

/**
 * MCP deep-link wiring test.
 *
 * Drives a real MCP tool call through the HTTP server and asserts the tool
 * result carries an authenticated "view on web" deep-link.
 *
 * Note on forgetful mode: `createMcpServer(db)` only receives the db handle
 * (http-server.ts is read-only and cannot forward its config flag), so the
 * MCP server detects forgetful mode via the same process env/argv signal that
 * `src/index.ts` uses. In the test environment MOB_FORGETFUL is unset, so the
 * server runs in persistent (link-emitting) mode regardless of the harness's
 * createServer({forgetful}) value. We therefore use the forgetful HTTP harness
 * purely because it needs no OAuth, while the MCP layer still emits the link.
 */
describe('MCP deep-link wiring', () => {
  let serverInstance: ReturnType<typeof createServer>;
  let httpServer: http.Server;
  let port: number;

  async function startServer() {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful: true, baseUrl: 'http://localhost:1234' });
    httpServer = http.createServer(serverInstance.app);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as any).port;
  }

  afterEach(() => {
    if (httpServer) httpServer.close();
    if (serverInstance) serverInstance.stop();
  });

  async function parseMcpResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const text = await response.text();
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
          try { return JSON.parse(line.substring(6)); } catch { /* skip */ }
        }
      }
      throw new Error('No JSON-RPC message found in SSE stream');
    }
    return response.json();
  }

  async function mcpRequest(body: any, sessionId?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    return fetch(`http://localhost:${port}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  async function initSession(): Promise<string> {
    const response = await mcpRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    const sessionId = response.headers.get('mcp-session-id')!;
    await mcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
    return sessionId;
  }

  it('appends a /web/auto-login deep-link to a contact_create result', async () => {
    await startServer();
    const sessionId = await initSession();

    const response = await mcpRequest({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'contact_create', arguments: { first_name: 'Deep', last_name: 'Link' } },
    }, sessionId);

    const data = await parseMcpResponse(response);
    const content = data.result.content as { type: string; text: string }[];

    // Primary JSON payload remains at content[0] (existing-test contract).
    const contact = JSON.parse(content[0].text);
    expect(contact.first_name).toBe('Deep');

    // A deep-link line is appended as an additional content block.
    const linkBlock = content.find((c) => c.text.includes('/web/auto-login'));
    expect(linkBlock).toBeDefined();
    expect(linkBlock!.text).toContain('View on web:');
    const url = linkBlock!.text.replace('View on web: ', '');
    // base_url may be empty in a cloned forgetful template DB, so the link can
    // be relative — parse against a dummy base to inspect path/query.
    const parsed = new URL(url, 'http://base.invalid');
    expect(parsed.pathname).toBe('/web/auto-login');
    expect(parsed.searchParams.get('token')).toBeTruthy();
    expect(parsed.searchParams.get('redirect')).toBe(`/app/contacts/${contact.id}`);
  });
});
