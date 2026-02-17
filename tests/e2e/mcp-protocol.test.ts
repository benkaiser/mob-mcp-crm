import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/server/http-server.js';
import http from 'node:http';

/**
 * E2E MCP Protocol Tests
 * Tests the full MCP protocol flow via HTTP requests.
 * In forgetful mode, no OAuth is needed — connect to /mcp directly.
 */
describe('E2E MCP Protocol', () => {
  let serverInstance: ReturnType<typeof createServer>;
  let httpServer: http.Server;
  let port: number;

  async function startServer(forgetful = false) {
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

  /**
   * Parse an MCP response which may be JSON or SSE
   */
  async function parseMcpResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      // Parse SSE to extract JSON-RPC message
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          try {
            return JSON.parse(data);
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
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return response;
  }

  async function initSession(token?: string): Promise<string> {
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

    // Send initialized notification
    await mcpRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, sessionId, token);

    return sessionId;
  }

  it('should establish a session in forgetful mode without OAuth', async () => {
    await startServer(true);

    // No token needed — connect directly
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
    expect(sessionId).not.toBeNull();

    const data = await parseMcpResponse(response);
    expect(data.result.serverInfo.name).toBe('mob-crm');
  });

  it('should reject non-init requests without session in forgetful mode', async () => {
    await startServer(true);

    const response = await mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });

    // Non-init request without session gets 401 from forgetful middleware
    expect(response.status).toBe(401);
  });

  it('should list tools after session establishment in forgetful mode', async () => {
    await startServer(true);
    const sessionId = await initSession();

    // List tools — no token needed
    const toolsResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }, sessionId);

    expect(toolsResponse.status).toBe(200);
    const toolsData = await parseMcpResponse(toolsResponse);
    expect(toolsData.result.tools).toBeDefined();
    expect(toolsData.result.tools.length).toBeGreaterThan(0);

    // Verify some expected tools are present
    const toolNames = toolsData.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('contact_create');
    expect(toolNames).toContain('contact_list');
    expect(toolNames).toContain('activity_manage');
    expect(toolNames).toContain('reminder_manage');
    expect(toolNames).toContain('data_export');
    expect(toolNames).toContain('data_statistics');
  });

  it('should call a tool and get a response in forgetful mode', async () => {
    await startServer(true);
    const sessionId = await initSession();

    // Create a contact — no token needed
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
    const createData = await parseMcpResponse(createResponse);
    expect(createData.result.content).toBeDefined();
    expect(createData.result.content[0].type).toBe('text');

    const contact = JSON.parse(createData.result.content[0].text);
    expect(contact.first_name).toBe('Test');
    expect(contact.last_name).toBe('User');
    expect(contact.company).toBe('ACME Corp');
    expect(contact.id).toBeDefined();
  });

  it('should handle tool errors gracefully', async () => {
    await startServer(true);
    const sessionId = await initSession();

    // Try to get non-existent contact
    const getResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_get',
        arguments: {
          contact_id: 'nonexistent',
        },
      },
    }, sessionId);

    expect(getResponse.status).toBe(200);
    const getData = await parseMcpResponse(getResponse);
    expect(getData.result.isError).toBe(true);
  });

  it('should reject GET /mcp without valid session in forgetful mode', async () => {
    await startServer(true);

    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'GET',
    });

    expect(response.status).toBe(401);
  });

  it('should reject DELETE /mcp without valid session in forgetful mode', async () => {
    await startServer(true);

    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(401);
  });

  it('should work in forgetful mode with Bluey seed data via prime', async () => {
    await startServer(true);
    const sessionId = await initSession();

    // Call prime — should return Bluey data with 'me' field
    const primeResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'prime',
        arguments: {},
      },
    }, sessionId);

    expect(primeResponse.status).toBe(200);
    const primeData = await parseMcpResponse(primeResponse);
    const result = JSON.parse(primeData.result.content[0].text);
    expect(result.me).toBeDefined();
    expect(result.me.name).toBe('Bluey Heeler');
    expect(result.total_contacts).toBeGreaterThan(0);
  });

  it('should work in forgetful mode with data_statistics', async () => {
    await startServer(true);
    const sessionId = await initSession();

    // Should be able to use tools
    const statsResponse = await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'data_statistics',
        arguments: {},
      },
    }, sessionId);

    expect(statsResponse.status).toBe(200);
    const statsData = await parseMcpResponse(statsResponse);
    const stats = JSON.parse(statsData.result.content[0].text);
    expect(stats.total_contacts).toBeDefined();
  });

  it('should isolate forgetful sessions from each other', async () => {
    await startServer(true);

    // Session A: init and create a contact
    const sessionA = await initSession();
    await mcpRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'contact_create',
        arguments: { first_name: 'Alice', last_name: 'Only' },
      },
    }, sessionA);

    // Session B: init and list contacts — should not see Alice
    const sessionB = await initSession();
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
});
