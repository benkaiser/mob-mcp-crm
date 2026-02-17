import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import http from 'node:http';

/**
 * MCP Auth Enforcement Tests
 * Tests that the /mcp endpoint properly requires authentication.
 * - In persistent mode: requires Bearer token (OAuth)
 * - In forgetful mode: no OAuth needed, but sessions are enforced
 */
describe('MCP Auth Enforcement', () => {
  let serverInstance: ReturnType<typeof createServer>;
  let httpServer: http.Server;
  let port: number;

  async function startServer(forgetful = true) {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;
    httpServer = http.createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address() as any;
    port = address.port;
  }

  afterEach(() => {
    if (httpServer) httpServer.close();
    if (serverInstance) serverInstance.stop();
  });

  async function parseMcpResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            return JSON.parse(line.substring(6));
          } catch {
            // skip non-JSON data lines
          }
        }
      }
      throw new Error('No JSON-RPC message found in SSE stream');
    }
    return response.json();
  }

  async function mcpRequest(body: any, sessionId?: string, token?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    return fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  async function initForgetfulSession(): Promise<string> {
    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    });

    const sessionId = response.headers.get('mcp-session-id')!;
    await mcpRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, sessionId);

    return sessionId;
  }

  // ─── Forgetful Mode: No OAuth Needed ─────────────────────

  it('should allow init request without Bearer token in forgetful mode', async () => {
    await startServer(true);

    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    });

    expect(response.status).toBe(200);
    const sessionId = response.headers.get('mcp-session-id');
    expect(sessionId).toBeDefined();
  });

  it('should return 401 for non-init POST without session in forgetful mode', async () => {
    await startServer(true);
    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(response.status).toBe(401);
  });

  it('should return 401 for GET /mcp without session in forgetful mode', async () => {
    await startServer(true);
    const response = await fetch(`http://localhost:${port}/mcp`, { method: 'GET' });
    expect(response.status).toBe(401);
  });

  it('should return 401 for DELETE /mcp without session in forgetful mode', async () => {
    await startServer(true);
    const response = await fetch(`http://localhost:${port}/mcp`, { method: 'DELETE' });
    expect(response.status).toBe(401);
  });

  it('should return 401 for POST with invalid/unknown session in forgetful mode', async () => {
    await startServer(true);
    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }, 'totally-fake-session-id-12345');
    expect(response.status).toBe(401);
  });

  // ─── Persistent Mode: OAuth Required ─────────────────────

  it('should return 401 without Bearer token on POST /mcp in persistent mode', async () => {
    await startServer(false);
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(response.status).toBe(401);
  });

  it('should return 401 without Bearer token on GET /mcp in persistent mode', async () => {
    await startServer(false);
    const response = await fetch(`http://localhost:${port}/mcp`, { method: 'GET' });
    expect(response.status).toBe(401);
  });

  it('should return 401 without Bearer token on DELETE /mcp in persistent mode', async () => {
    await startServer(false);
    const response = await fetch(`http://localhost:${port}/mcp`, { method: 'DELETE' });
    expect(response.status).toBe(401);
  });

  it('should return 401 with an invalid/fake Bearer token in persistent mode', async () => {
    await startServer(false);
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer totally-fake-token-12345',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        },
      }),
    });
    expect(response.status).toBe(401);
  });

  // ─── Forgetful Mode: Full Tool Flow ──────────────────────

  it('should complete full flow in forgetful mode: init → tool call (no OAuth)', async () => {
    await startServer(true);
    const sessionId = await initForgetfulSession();

    // Use a tool — no bearer token needed
    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_create',
        arguments: { first_name: 'AuthTest', last_name: 'User' },
      },
    }, sessionId);

    expect(response.status).toBe(200);
    const data = await parseMcpResponse(response);
    const contact = JSON.parse(data.result.content[0].text);
    expect(contact.first_name).toBe('AuthTest');
    expect(contact.id).toBeDefined();
  });

  // ─── Multi-Session Isolation (Forgetful Mode) ────────────

  it('should isolate contacts between different forgetful sessions', async () => {
    await startServer(true);

    // Session A: create a contact
    const sessionA = await initForgetfulSession();

    await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_create',
        arguments: { first_name: 'Alice', last_name: 'Only' },
      },
    }, sessionA);

    // Session B: list contacts — should not see Alice
    const sessionB = await initForgetfulSession();

    const listResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_list',
        arguments: { search: 'Alice Only' },
      },
    }, sessionB);

    const listData = await parseMcpResponse(listResponse);
    const contacts = JSON.parse(listData.result.content[0].text);

    // Session B should NOT see Session A's contacts
    expect(contacts.data).toHaveLength(0);
  });

  // ─── Well-Known Metadata Endpoints ──────────────────────

  it('should serve OAuth protected resource metadata in persistent mode', async () => {
    await startServer(false);

    const response = await fetch(
      `http://localhost:${port}/.well-known/oauth-protected-resource/mcp`
    );

    expect(response.status).toBe(200);
    const metadata = await response.json() as any;
    expect(metadata.resource).toBeDefined();
    expect(metadata.authorization_servers).toBeDefined();
    expect(metadata.authorization_servers.length).toBeGreaterThan(0);
  });

  it('should serve OAuth authorization server metadata in persistent mode', async () => {
    await startServer(false);

    const response = await fetch(
      `http://localhost:${port}/.well-known/oauth-authorization-server`
    );

    expect(response.status).toBe(200);
    const metadata = await response.json() as any;
    expect(metadata.issuer).toBeDefined();
    expect(metadata.authorization_endpoint).toBeDefined();
    expect(metadata.token_endpoint).toBeDefined();
    expect(metadata.response_types_supported).toContain('code');
  });

  it('should serve OAuth metadata even in forgetful mode for client compatibility', async () => {
    await startServer(true);

    const resourceResponse = await fetch(
      `http://localhost:${port}/.well-known/oauth-protected-resource/mcp`
    );
    expect(resourceResponse.status).toBe(200);

    const serverResponse = await fetch(
      `http://localhost:${port}/.well-known/oauth-authorization-server`
    );
    expect(serverResponse.status).toBe(200);
  });
});
