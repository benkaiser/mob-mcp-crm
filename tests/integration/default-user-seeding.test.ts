import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import http from 'node:http';

/**
 * Tests that the server properly handles user creation and contact operations
 * through the MCP flow.
 *
 * In forgetful mode, no OAuth is needed — connect to /mcp directly.
 * In persistent mode, OAuth is required.
 */
describe('Authenticated User Contact Creation', () => {
  let serverInstance: ReturnType<typeof createServer>;
  let httpServer: http.Server;
  let port: number;

  afterEach(() => {
    if (httpServer) httpServer.close();
    if (serverInstance) serverInstance.stop();
  });

  async function startServer(forgetful = false) {
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful, baseUrl: 'http://localhost:0' });
    const app = serverInstance.app;
    httpServer = http.createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address() as any;
    port = address.port;
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

  it('should allow contact_create via MCP in forgetful mode (no OAuth)', async () => {
    await startServer(true);
    const sessionId = await initForgetfulSession();

    // Call contact_create — no token needed in forgetful mode
    const createResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_create',
        arguments: {
          first_name: 'Test',
          last_name: 'User',
          company: 'ACME Corp',
        },
      },
    }, sessionId);

    expect(createResponse.status).toBe(200);

    const data = await parseMcpResponse(createResponse);
    expect(data).toBeDefined();
    expect(data.result).toBeDefined();
    expect(data.result.isError).toBeUndefined();

    const contact = JSON.parse(data.result.content[0].text);
    expect(contact.first_name).toBe('Test');
    expect(contact.last_name).toBe('User');
    expect(contact.company).toBe('ACME Corp');
    expect(contact.id).toBeDefined();
    // user_id should be the forgetful session user's ID, not 'default'
    expect(contact.user_id).toBeDefined();
    expect(contact.user_id).not.toBe('default');
  });

  it('should reject unauthenticated MCP requests in persistent mode', async () => {
    await startServer(false);

    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
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

  it('should allow contact_create in persistent mode with registered user', async () => {
    await startServer(false);

    // Register a user first
    const registerResponse = await fetch(`http://localhost:${port}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Persistent User',
        email: 'persistent@test.com',
        password: 'testpass123',
      }),
    });
    expect(registerResponse.status).toBe(201);

    // Authorize with credentials
    const authResponse = await fetch(`http://localhost:${port}/auth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'persistent@test.com',
        password: 'testpass123',
        client_id: 'test-client',
        code_challenge: 'test-verifier',
        code_challenge_method: 'plain',
        redirect_uri: 'http://localhost',
      }),
    });
    const authData = await authResponse.json() as any;
    expect(authData.code).toBeDefined();

    // Exchange for token
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
    const token = tokenData.access_token;
    expect(token).toBeDefined();

    // Init MCP session
    const initResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    }, undefined, token);

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id')!;

    // Send initialized notification
    await mcpRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, sessionId, token);

    // Create contact
    const createResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_create',
        arguments: { first_name: 'Persistent', last_name: 'Contact' },
      },
    }, sessionId, token);

    expect(createResponse.status).toBe(200);
    const data = await parseMcpResponse(createResponse);
    const contact = JSON.parse(data.result.content[0].text);
    expect(contact.first_name).toBe('Persistent');
    expect(contact.user_id).toBeDefined();
    expect(contact.user_id).not.toBe('default');
  });
});
