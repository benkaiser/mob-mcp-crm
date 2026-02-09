import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import http from 'node:http';

/**
 * MCP OAuth Auth Enforcement Tests
 * Tests that the /mcp endpoint properly requires Bearer token authentication
 * and that multi-user isolation works correctly.
 */
describe('MCP Auth Enforcement', () => {
  let serverInstance: ReturnType<typeof createServer>;
  let httpServer: http.Server;
  let port: number;

  async function startServer(forgetful = true) {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful });
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

  async function obtainToken(): Promise<string> {
    const authResponse = await fetch(`http://localhost:${port}/auth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'test-client',
        code_challenge: 'test-verifier',
        code_challenge_method: 'plain',
        redirect_uri: 'http://localhost',
      }),
    });
    const authData = await authResponse.json() as any;

    const tokenResponse = await fetch(`http://localhost:${port}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: authData.code,
        code_verifier: 'test-verifier',
        client_id: 'test-client',
        redirect_uri: 'http://localhost',
      }),
    });
    const tokenData = await tokenResponse.json() as any;
    return tokenData.access_token;
  }

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

  async function initSession(token: string): Promise<string> {
    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    }, undefined, token);

    const sessionId = response.headers.get('mcp-session-id')!;
    await mcpRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, sessionId, token);

    return sessionId;
  }

  // ─── 401 Tests ──────────────────────────────────────────────

  it('should return 401 without Bearer token on POST /mcp', async () => {
    await startServer();
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(response.status).toBe(401);
  });

  it('should return 401 without Bearer token on GET /mcp', async () => {
    await startServer();
    const response = await fetch(`http://localhost:${port}/mcp`, { method: 'GET' });
    expect(response.status).toBe(401);
  });

  it('should return 401 without Bearer token on DELETE /mcp', async () => {
    await startServer();
    const response = await fetch(`http://localhost:${port}/mcp`, { method: 'DELETE' });
    expect(response.status).toBe(401);
  });

  it('should return 401 with an invalid/fake Bearer token', async () => {
    await startServer();
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

  // ─── Successful Auth Flow ──────────────────────────────────

  it('should complete full auth flow: authorize -> token -> MCP tool call', async () => {
    await startServer();
    const token = await obtainToken();
    const sessionId = await initSession(token);

    // Use a tool
    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_create',
        arguments: { first_name: 'AuthTest', last_name: 'User' },
      },
    }, sessionId, token);

    expect(response.status).toBe(200);
    const data = await parseMcpResponse(response);
    const contact = JSON.parse(data.result.content[0].text);
    expect(contact.first_name).toBe('AuthTest');
    expect(contact.id).toBeDefined();
  });

  // ─── Multi-User Isolation ──────────────────────────────────

  it('should isolate contacts between different authenticated users', async () => {
    await startServer();

    // User A: obtain token and create a contact
    const tokenA = await obtainToken();
    const sessionA = await initSession(tokenA);

    await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_create',
        arguments: { first_name: 'Alice', last_name: 'Only' },
      },
    }, sessionA, tokenA);

    // User B: obtain a different token and list contacts
    const tokenB = await obtainToken();
    const sessionB = await initSession(tokenB);

    const listResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_list',
        arguments: {},
      },
    }, sessionB, tokenB);

    const listData = await parseMcpResponse(listResponse);
    const contacts = JSON.parse(listData.result.content[0].text);

    // User B should NOT see User A's contacts
    expect(contacts.data).toHaveLength(0);
    expect(contacts.total).toBe(0);
  });

  // ─── Well-Known Metadata Endpoints ──────────────────────────

  it('should serve OAuth protected resource metadata', async () => {
    await startServer();

    const response = await fetch(
      `http://localhost:${port}/.well-known/oauth-protected-resource/mcp`
    );

    expect(response.status).toBe(200);
    const metadata = await response.json() as any;
    expect(metadata.resource).toBeDefined();
    expect(metadata.authorization_servers).toBeDefined();
    expect(metadata.authorization_servers.length).toBeGreaterThan(0);
  });

  it('should serve OAuth authorization server metadata', async () => {
    await startServer();

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
});
