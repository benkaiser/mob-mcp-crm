import http from 'node:http';

export interface ServerConfig {
  port: number;
  dataDir: string;
  forgetful: boolean;
}

export function createServer(config: ServerConfig) {
  const { port } = config;

  const requestHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>🦘 Mob CRM</h1><p>An AI-first Personal CRM. Connect via MCP at /mcp</p>');
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', mode: config.forgetful ? 'forgetful' : 'persistent' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  };

  const server = http.createServer(requestHandler);

  return {
    start: () => {
      server.listen(port, () => {
        console.log(`   URL: http://localhost:${port}`);
        console.log(`   MCP: http://localhost:${port}/mcp`);
        console.log('');
        console.log('🦘 Mob CRM is ready!');
      });
    },
    stop: () => {
      server.close();
    },
  };
}
