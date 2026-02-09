import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import http from 'node:http';

/**
 * Tests that the server properly handles user creation and contact operations
 * through the OAuth-authenticated MCP flow.
 *
 * Previously, these tests verified the DEFAULT_USER_ID seeding mechanism.
 * Now that auth is enforced on /mcp, each user is created via the OAuth flow
 * (either forgetful-mode temp users or registered persistent users).
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
    serverInstance = createServer({ port: 0, dataDir: ':memory:', forgetful });
    const app = serverInstance.app;
    httpServer = http.createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address() as any;
    port = address.port;
  }

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

  it('should allow contact_create via authenticated MCP in forgetful mode', async () => {
    await startServer(true);
    const token = await obtainToken();

    // Initialize MCP session
    const initResponse = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
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

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id')!;
    expect(sessionId).toBeDefined();

    // Send initialized notification
    await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    // Call contact_create
    const createResponse = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
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
      }),
    });

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
    // user_id should be the authenticated user's ID, not 'default'
    expect(contact.user_id).toBeDefined();
    expect(contact.user_id).not.toBe('default');
  });

  it('should reject unauthenticated MCP requests', async () => {
    await startServer(true);

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
    const initResponse = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
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

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id')!;

    // Send initialized notification
    await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    // Create contact
    const createResponse = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'contact_create',
          arguments: { first_name: 'Persistent', last_name: 'Contact' },
        },
      }),
    });

    expect(createResponse.status).toBe(200);
    const data = await parseMcpResponse(createResponse);
    const contact = JSON.parse(data.result.content[0].text);
    expect(contact.first_name).toBe('Persistent');
    expect(contact.user_id).toBeDefined();
    expect(contact.user_id).not.toBe('default');
  });
});
