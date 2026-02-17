import { randomUUID } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type Database from 'better-sqlite3';
import { createMcpServer } from './mcp-server.js';
import { createDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrator.js';
import { AccountService } from '../auth/accounts.js';
import { OAuthService } from '../auth/oauth.js';
import { McpTokenVerifier } from '../auth/mcp-token-verifier.js';
import { importMonicaExport } from '../services/monica-import.js';
import { generateId } from '../utils.js';
import { ForgetfulTemplate } from '../db/forgetful-template.js';

export interface ServerConfig {
  port: number;
  dataDir: string;
  forgetful: boolean;
  baseUrl: string;
}

export function createServer(config: ServerConfig): {
  start: () => void;
  stop: () => void;
  app: express.Express;
  db: Database.Database;
} {
  const { port } = config;

  // Initialize database
  const db = createDatabase({
    dataDir: config.dataDir,
    inMemory: config.forgetful,
  });
  runMigrations(db);

  // Forgetful mode: pre-build a template DB and track per-user clones
  const forgetfulTemplate = config.forgetful ? new ForgetfulTemplate() : null;
  const forgetfulDbs = new Map<string, Database.Database>();

  // Initialize auth services
  const accountService = new AccountService(db);
  const oauthService = new OAuthService(db, accountService);

  // Set up OAuth token verifier and bearer auth middleware for MCP endpoints
  const tokenVerifier = new McpTokenVerifier(oauthService);
  const bearerAuth = requireBearerAuth({ verifier: tokenVerifier });

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Track active MCP sessions
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  // Track web sessions (simple token → userId map)
  const webSessions = new Map<string, { userId: string; userName: string; email: string }>();

  // File upload handler (in-memory, max 50MB for SQL files)
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  /** Middleware: require web session cookie */
  function requireWebSession(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const sessionToken = parseCookie(req.headers.cookie ?? '', 'mob_session');
    if (!sessionToken) {
      res.redirect('/web/login');
      return;
    }
    const session = webSessions.get(sessionToken);
    if (!session) {
      // Expired/invalid session — clear cookie and redirect
      res.setHeader('Set-Cookie', 'mob_session=; Path=/; HttpOnly; Max-Age=0');
      res.redirect('/web/login');
      return;
    }
    // Attach user info to request for downstream use
    (req as any).webUser = session;
    next();
  }

  // ─── Homepage ──────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.send(getHomepageHtml(port));
  });

  // ─── Health Check ──────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: config.forgetful ? 'forgetful' : 'persistent' });
  });

  // ─── OAuth Protected Resource Metadata ───────────────────
  const serverUrl = config.baseUrl;
  app.use(mcpAuthMetadataRouter({
    oauthMetadata: {
      issuer: serverUrl,
      authorization_endpoint: `${serverUrl}/auth/authorize`,
      token_endpoint: `${serverUrl}/auth/token`,
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256', 'plain'],
    },
    resourceServerUrl: new URL(`${serverUrl}/mcp`),
  }));

  // ─── Account Endpoints ────────────────────────────────────

  // API registration endpoint (JSON)
  app.post('/auth/register', async (req, res) => {
    // If this is a form post from the browser registration page, handle it separately
    const isFormPost = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    if (isFormPost) {
      const { name, email, password } = req.body;
      const client_id = req.query.client_id as string;
      const code_challenge = req.query.code_challenge as string;
      const code_challenge_method = req.query.code_challenge_method as string;
      const redirect_uri = req.query.redirect_uri as string;
      const state = req.query.state as string;

      if (!name || !email || !password) {
        const originalUrl = req.originalUrl;
        res.status(400).send(getRegisterPageHtml(originalUrl, 'Full name, email, and password are required'));
        return;
      }

      try {
        const user = await accountService.createAccount({ name, email, password });

        // If we're in an OAuth flow, issue code and redirect
        if (client_id && redirect_uri) {
          const code = oauthService.createAuthorizationCode({
            userId: user.id,
            clientId: client_id,
            codeChallenge: code_challenge || 'none',
            codeChallengeMethod: code_challenge_method || 'S256',
            redirectUri: redirect_uri,
          });
          const redirectUrl = new URL(redirect_uri);
          redirectUrl.searchParams.set('code', code);
          if (state) redirectUrl.searchParams.set('state', state);
          res.redirect(redirectUrl.toString());
        } else {
          // Not in OAuth flow — auto-login and redirect to dashboard
          const token = randomUUID();
          webSessions.set(token, { userId: user.id, userName: user.name, email: user.email });
          res.setHeader('Set-Cookie', `mob_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
          res.redirect('/web/dashboard');
        }
      } catch (err: any) {
        console.error('Registration error:', err);
        if (err.message.includes('already exists')) {
          res.status(409).send(getRegisterPageHtml(req.originalUrl, 'An account with that email already exists'));
        } else {
          res.status(500).send(getRegisterPageHtml(req.originalUrl, 'Something went wrong. Please try again.'));
        }
      }
      return;
    }

    // JSON API registration
    try {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        res.status(400).json({ error: 'name, email, and password are required' });
        return;
      }
      const user = await accountService.createAccount({ name, email, password });
      res.status(201).json(user);
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.message.includes('already exists')) {
        res.status(409).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // Browser registration page (GET)
  app.get('/auth/register', (_req, res) => {
    if (config.forgetful) {
      // No registration needed in forgetful mode
      res.redirect('/');
      return;
    }
    res.send(getRegisterPageHtml(_req.originalUrl));
  });

  // ─── OAuth 2.0 PKCE Endpoints ─────────────────────────────

  // Authorization endpoint — GET: browser-based OAuth flow
  app.get('/auth/authorize', async (req, res) => {
    const {
      client_id,
      code_challenge,
      code_challenge_method,
      redirect_uri,
      response_type,
      state,
    } = req.query as Record<string, string>;

    if (response_type && response_type !== 'code') {
      res.status(400).json({ error: 'unsupported_response_type' });
      return;
    }

    // In forgetful mode, auto-approve: create temp user, issue code, redirect
    if (config.forgetful) {
      const tempId = generateId();
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES (?, ?, ?, ?)
      `).run(tempId, 'Bluey Heeler', `bluey-${tempId}@heeler.family`, 'none');

      // Clone template DB for this user session
      if (forgetfulTemplate) {
        const clonedDb = forgetfulTemplate.clone(tempId);
        forgetfulDbs.set(tempId, clonedDb);
      }

      const code = oauthService.createAuthorizationCode({
        userId: tempId,
        clientId: client_id || 'anonymous',
        codeChallenge: code_challenge || 'none',
        codeChallengeMethod: code_challenge_method || 'plain',
        redirectUri: redirect_uri || 'http://localhost',
      });

      const redirectUrl = new URL(redirect_uri || 'http://localhost');
      redirectUrl.searchParams.set('code', code);
      if (state) redirectUrl.searchParams.set('state', state);
      res.redirect(redirectUrl.toString());
      return;
    }

    // Persistent mode — show login form
    res.send(getLoginPageHtml(req.originalUrl));
  });

  // Authorization endpoint — POST: accepts login credentials + PKCE params
  app.post('/auth/authorize', async (req, res) => {
    // Support both JSON body (API clients) and form-encoded (login form)
    const isFormPost = req.headers['content-type']?.includes('application/x-www-form-urlencoded');
    const email = req.body.email;
    const password = req.body.password;
    const client_id = req.body.client_id || req.query.client_id as string;
    const code_challenge = req.body.code_challenge || req.query.code_challenge as string;
    const code_challenge_method = req.body.code_challenge_method || req.query.code_challenge_method as string;
    const redirect_uri = req.body.redirect_uri || req.query.redirect_uri as string;
    const state = req.body.state || req.query.state as string;

    // In forgetful mode, skip login and issue code for a temporary user
    if (config.forgetful) {
      // Create a temporary user for this session
      const tempId = generateId();
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash)
        VALUES (?, ?, ?, ?)
      `).run(tempId, 'Bluey Heeler', `bluey-${tempId}@heeler.family`, 'none');

      // Clone template DB for this user session
      if (forgetfulTemplate) {
        const clonedDb = forgetfulTemplate.clone(tempId);
        forgetfulDbs.set(tempId, clonedDb);
      }

      const code = oauthService.createAuthorizationCode({
        userId: tempId,
        clientId: client_id || 'anonymous',
        codeChallenge: code_challenge || 'none',
        codeChallengeMethod: code_challenge_method || 'plain',
        redirectUri: redirect_uri || 'http://localhost',
      });

      // Form posts (browser login) get a redirect; JSON API calls get JSON
      if (isFormPost && redirect_uri) {
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', code);
        if (state) redirectUrl.searchParams.set('state', state);
        res.redirect(redirectUrl.toString());
      } else {
        res.json({ code, redirect_uri: redirect_uri || 'http://localhost' });
      }
      return;
    }

    // Persistent mode — require login
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    if (!client_id || !code_challenge) {
      res.status(400).json({ error: 'client_id and code_challenge are required' });
      return;
    }

    const user = await accountService.login(email, password);
    if (!user) {
      // If this came from the login form, re-render with error
      if (isFormPost) {
        const originalUrl = `/auth/authorize?client_id=${encodeURIComponent(client_id)}&code_challenge=${encodeURIComponent(code_challenge)}&code_challenge_method=${encodeURIComponent(code_challenge_method || 'S256')}&redirect_uri=${encodeURIComponent(redirect_uri || '')}&state=${encodeURIComponent(state || '')}`;
        res.status(401).send(getLoginPageHtml(originalUrl, 'Invalid email or password'));
        return;
      }
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const code = oauthService.createAuthorizationCode({
      userId: user.id,
      clientId: client_id,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'S256',
      redirectUri: redirect_uri || 'http://localhost',
    });

    // Form posts (browser login) get a redirect; JSON API calls get JSON
    if (isFormPost && redirect_uri) {
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', code);
      if (state) redirectUrl.searchParams.set('state', state);
      res.redirect(redirectUrl.toString());
    } else {
      res.json({ code, redirect_uri: redirect_uri || 'http://localhost' });
    }
  });

  // Token endpoint — exchange auth code for access token
  app.post('/auth/token', (req, res) => {
    const { grant_type, code, code_verifier, client_id, redirect_uri } = req.body;

    if (grant_type !== 'authorization_code') {
      res.status(400).json({ error: 'unsupported_grant_type' });
      return;
    }

    if (!code || !client_id) {
      res.status(400).json({ error: 'code and client_id are required' });
      return;
    }

    const token = oauthService.exchangeCode({
      code,
      codeVerifier: code_verifier || '',
      clientId: client_id,
      redirectUri: redirect_uri || 'http://localhost',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!token) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
      return;
    }

    res.json(token);
  });

  // ─── Web Login ──────────────────────────────────────────────

  app.get('/web/login', (_req, res) => {
    if (config.forgetful) {
      // Auto-login in forgetful mode
      const tempId = generateId();
      db.prepare(`INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`)
        .run(tempId, 'Bluey Heeler', `bluey-${tempId}@heeler.family`, 'none');

      // Clone template DB for this user session
      if (forgetfulTemplate) {
        const clonedDb = forgetfulTemplate.clone(tempId);
        forgetfulDbs.set(tempId, clonedDb);
      }

      const token = randomUUID();
      webSessions.set(token, { userId: tempId, userName: 'Bluey Heeler', email: `bluey-${tempId}@heeler.family` });
      res.setHeader('Set-Cookie', `mob_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
      res.redirect('/web/dashboard');
      return;
    }
    res.send(getWebLoginPageHtml());
  });

  app.post('/web/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).send(getWebLoginPageHtml('Email and password are required'));
      return;
    }

    const user = await accountService.login(email, password);
    if (!user) {
      res.status(401).send(getWebLoginPageHtml('Invalid email or password'));
      return;
    }

    const token = randomUUID();
    webSessions.set(token, { userId: user.id, userName: user.name, email: user.email });
    res.setHeader('Set-Cookie', `mob_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
    res.redirect('/web/dashboard');
  });

  app.get('/web/logout', (req, res) => {
    const sessionToken = parseCookie(req.headers.cookie ?? '', 'mob_session');
    if (sessionToken) {
      webSessions.delete(sessionToken);
    }
    res.setHeader('Set-Cookie', 'mob_session=; Path=/; HttpOnly; Max-Age=0');
    res.redirect('/web/login');
  });

  // ─── Web Dashboard ────────────────────────────────────────

  app.get('/web/dashboard', requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string; userName: string; email: string };
    res.send(getDashboardHtml(user.userName));
  });

  // ─── Monica Import ────────────────────────────────────────

  app.post('/web/import/monica', requireWebSession, upload.single('sqlfile'), (req, res) => {
    const user = (req as any).webUser as { userId: string; userName: string; email: string };

    if (!req.file) {
      res.status(400).send(getDashboardHtml(user.userName, 'No file uploaded. Please select a SQL file.'));
      return;
    }

    const sqlContent = req.file.buffer.toString('utf-8');

    if (!sqlContent.includes('INSERT') || sqlContent.length < 100) {
      res.status(400).send(getDashboardHtml(user.userName, 'The file does not appear to be a valid Monica SQL export.'));
      return;
    }

    try {
      const result = importMonicaExport(db, user.userId, sqlContent);

      const summary = [
        `${result.contacts} contacts`,
        `${result.tags} tags`,
        `${result.contactMethods} contact methods`,
        `${result.notes} notes`,
        `${result.activities} activities`,
        `${result.relationships} relationships`,
        `${result.addresses} addresses`,
        `${result.lifeEvents} life events`,
        `${result.gifts} gifts`,
        `${result.reminders} reminders`,
        `${result.calls} call records`,
      ].join(', ');

      const errorSummary = result.errors.length > 0
        ? ` (${result.errors.length} warnings: ${result.errors.slice(0, 3).join('; ')}${result.errors.length > 3 ? '...' : ''})`
        : '';

      res.send(getDashboardHtml(user.userName, undefined, `Import complete! Imported: ${summary}.${errorSummary}`));
    } catch (err: any) {
      res.status(500).send(getDashboardHtml(user.userName, `Import failed: ${err.message}`));
    }
  });

  // ─── MCP Streamable HTTP: POST ─────────────────────────────
  app.post('/mcp', bearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — reuse its transport
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // New session — only allowed for initialization requests
    if (!sessionId && isInitializeRequest(req.body)) {
      // Determine which DB to use for this MCP session
      const userId = (req as any).auth?.extra?.userId as string | undefined;
      const mcpDb = (config.forgetful && userId && forgetfulDbs.has(userId))
        ? forgetfulDbs.get(userId)!
        : db;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
        // Clean up forgetful DB clone when transport closes
        if (config.forgetful && userId && forgetfulDbs.has(userId)) {
          const clonedDb = forgetfulDbs.get(userId)!;
          try { clonedDb.close(); } catch { /* already closed */ }
          forgetfulDbs.delete(userId);
        }
      };

      const server = createMcpServer(mcpDb);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session or not an initialization request' },
      id: null,
    });
  });

  // ─── MCP Streamable HTTP: GET (SSE stream) ─────────────────
  app.get('/mcp', bearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Invalid or missing session ID' },
        id: null,
      });
    }
  });

  // ─── MCP Streamable HTTP: DELETE (session termination) ──────
  app.delete('/mcp', bearerAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: Invalid or missing session ID' },
        id: null,
      });
    }
  });

  // ─── Server Lifecycle ──────────────────────────────────────
  let httpServer: ReturnType<typeof app.listen>;

  // Clean up expired tokens periodically
  const cleanupInterval = setInterval(() => oauthService.cleanup(), 5 * 60 * 1000);

  return {
    start: () => {
      httpServer = app.listen(port, () => {
        console.log(`   URL: http://localhost:${port}`);
        console.log(`   MCP: http://localhost:${port}/mcp`);
        console.log('');
        console.log('🦘 Mob CRM is ready!');
      });
      httpServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`\n❌ Port ${port} is already in use. Set a different port with PORT=<number>.`);
        } else {
          console.error(`\n❌ Failed to start server:`, err.message);
        }
        process.exit(1);
      });
    },
    stop: () => {
      clearInterval(cleanupInterval);
      // Close all active transports
      for (const [sid, transport] of Object.entries(transports)) {
        transport.close();
        delete transports[sid];
      }
      // Close database
      db.close();
      // Close all forgetful DB clones
      for (const [uid, clonedDb] of forgetfulDbs) {
        try { clonedDb.close(); } catch { /* already closed */ }
        forgetfulDbs.delete(uid);
      }
      // Close HTTP server
      if (httpServer) {
        httpServer.close();
      }
    },
    // Expose for testing
    app,
    db,
  };
}

function getLoginPageHtml(authorizeUrl: string, error?: string): string {
  // Build register URL preserving the OAuth query params
  const registerUrl = authorizeUrl.replace('/auth/authorize', '/auth/register');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Mob CRM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; text-align: center; }
    .subtitle { text-align: center; color: #666; margin-bottom: 1.5rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.3rem; font-size: 0.9rem; }
    input[type="email"], input[type="password"] { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; }
    input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    button { width: 100%; padding: 0.7rem; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.6rem 0.8rem; margin-bottom: 1rem; font-size: 0.9rem; }
    .alt-link { text-align: center; margin-top: 1rem; font-size: 0.9rem; color: #666; }
    .alt-link a { color: #2563eb; text-decoration: none; }
    .alt-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🦘 Mob</h1>
    <p class="subtitle">Sign in to your CRM</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="${authorizeUrl}">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>
      <button type="submit">Sign In</button>
    </form>
    <p class="alt-link">Don't have an account? <a href="${registerUrl}">Create one</a></p>
  </div>
</body>
</html>`;
}

function getRegisterPageHtml(registerUrl: string, error?: string, success?: string): string {
  // Build login URL: if coming from web flow, link back to /web/login; otherwise use OAuth authorize
  const isWebFlow = registerUrl.includes('from=web');
  const loginUrl = isWebFlow ? '/web/login' : registerUrl.replace('/auth/register', '/auth/authorize');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create Account — Mob CRM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; text-align: center; }
    .subtitle { text-align: center; color: #666; margin-bottom: 1.5rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.3rem; font-size: 0.9rem; }
    input[type="text"], input[type="email"], input[type="password"] { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; }
    input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    button { width: 100%; padding: 0.7rem; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.6rem 0.8rem; margin-bottom: 1rem; font-size: 0.9rem; }
    .success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 6px; padding: 0.6rem 0.8rem; margin-bottom: 1rem; font-size: 0.9rem; }
    .alt-link { text-align: center; margin-top: 1rem; font-size: 0.9rem; color: #666; }
    .alt-link a { color: #2563eb; text-decoration: none; }
    .alt-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🦘 Mob</h1>
    <p class="subtitle">Create your account</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    ${success ? `<div class="success">${success}</div>` : ''}
    <form method="POST" action="${registerUrl}">
      <label for="name">Full Name</label>
      <input type="text" id="name" name="name" required autofocus>
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required minlength="6">
      <button type="submit">Create Account</button>
    </form>
    <p class="alt-link">Already have an account? <a href="${loginUrl}">Sign in</a></p>
  </div>
</body>
</html>`;
}

function getHomepageHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mob — AI-First Personal CRM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; margin-top: 2rem; margin-bottom: 0.5rem; color: #555; }
    p { margin-bottom: 1rem; }
    .tagline { font-size: 1.2rem; color: #666; margin-bottom: 2rem; }
    .origin { font-size: 0.9rem; color: #888; font-style: italic; margin-bottom: 2rem; }
    code { background: #f4f4f4; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; margin-bottom: 1rem; }
    pre code { background: none; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #eee; }
    th { color: #555; font-weight: 600; }
    .examples { list-style: none; }
    .examples li { padding: 0.5rem 0; border-bottom: 1px solid #f0f0f0; }
    .examples li::before { content: '💬 '; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>🦘 Mob</h1>
  <p class="tagline">An AI-first Personal CRM</p>
  <p class="origin">"Mob" is the name for a group of kangaroos.</p>

  <p>Mob is a personal CRM you interact with entirely through natural language via an AI assistant. No forms, no dashboards — just talk about your relationships and Mob keeps track.</p>

  <h2>How to Connect</h2>
  <table>
    <tr><th>Transport</th><td>Streamable HTTP</td></tr>
    <tr><th>Server URL</th><td><code>http://localhost:${port}/mcp</code></td></tr>
    <tr><th>Auth</th><td>OAuth 2.0 with PKCE</td></tr>
  </table>

  <p>Recommended client: <a href="https://github.com/benkaiser/joey-mcp-client">Joey MCP Client</a></p>

  <h2>Example Interactions</h2>
  <ul class="examples">
    <li>Add a new contact: Sarah Chen, she works at Google as a senior engineer</li>
    <li>Log that I had coffee with Mike yesterday at Blue Bottle</li>
    <li>When is Tom's birthday?</li>
    <li>Remind me to call Lisa next Tuesday</li>
    <li>Who haven't I talked to in a while?</li>
  </ul>

  <h2>Web Dashboard</h2>
  <p><a href="/web/login">Sign in to the web dashboard</a> to import your Monica CRM data.</p>
</body>
</html>`;
}

// ─── Web Login Page ─────────────────────────────────────────────

function getWebLoginPageHtml(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Mob CRM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f5f5f5; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; text-align: center; }
    .subtitle { text-align: center; color: #666; margin-bottom: 1.5rem; }
    label { display: block; font-weight: 600; margin-bottom: 0.3rem; font-size: 0.9rem; }
    input[type="email"], input[type="password"] { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; }
    input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    button { width: 100%; padding: 0.7rem; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.6rem 0.8rem; margin-bottom: 1rem; font-size: 0.9rem; }
    .alt-link { text-align: center; margin-top: 1rem; font-size: 0.9rem; color: #666; }
    .alt-link a { color: #2563eb; text-decoration: none; }
    .alt-link a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🦘 Mob</h1>
    <p class="subtitle">Sign in to the dashboard</p>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/web/login">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" required>
      <button type="submit">Sign In</button>
    </form>
    <p class="alt-link">Don't have an account? <a href="/auth/register?from=web">Create one</a></p>
  </div>
</body>
</html>`;
}

// ─── Dashboard Page ─────────────────────────────────────────────

function getDashboardHtml(userName: string, error?: string, success?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard — Mob CRM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
    .navbar { background: #1e293b; color: #fff; padding: 0.8rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
    .navbar h1 { font-size: 1.2rem; }
    .navbar .user-info { display: flex; align-items: center; gap: 1rem; font-size: 0.9rem; }
    .navbar a { color: #93c5fd; text-decoration: none; font-size: 0.9rem; }
    .navbar a:hover { text-decoration: underline; }
    .container { max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 2rem; margin-bottom: 1.5rem; }
    h2 { font-size: 1.4rem; margin-bottom: 0.5rem; color: #1e293b; }
    p { margin-bottom: 1rem; color: #666; }
    .warning { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 0.8rem 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; color: #92400e; }
    .warning strong { color: #78350f; }
    label { display: block; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9rem; }
    input[type="file"] { display: block; width: 100%; padding: 0.6rem; border: 2px dashed #ddd; border-radius: 6px; font-size: 0.9rem; margin-bottom: 1rem; cursor: pointer; background: #fafafa; }
    input[type="file"]:hover { border-color: #2563eb; background: #eff6ff; }
    button { padding: 0.7rem 1.5rem; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    button.danger { background: #dc2626; }
    button.danger:hover { background: #b91c1c; }
    .error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 0.8rem 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 6px; padding: 0.8rem 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .help-text { font-size: 0.85rem; color: #888; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="navbar">
    <h1>🦘 Mob CRM</h1>
    <div class="user-info">
      <span>${escapeHtml(userName)}</span>
      <a href="/web/logout">Sign Out</a>
    </div>
  </div>
  <div class="container">
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    ${success ? `<div class="success">${escapeHtml(success)}</div>` : ''}

    <div class="card">
      <h2>Import from Monica CRM</h2>
      <p>Upload your Monica CRM SQL export file to import your contacts, notes, activities, tags, relationships, and more.</p>

      <div class="warning">
        <strong>Warning:</strong> Importing will <strong>replace all your existing contacts and data</strong> in Mob CRM. This action cannot be undone.
      </div>

      <form method="POST" action="/web/import/monica" enctype="multipart/form-data">
        <label for="sqlfile">Monica SQL Export File</label>
        <input type="file" id="sqlfile" name="sqlfile" accept=".sql,.txt" required>
        <p class="help-text">Export your data from Monica CRM (Settings &rarr; Export) and upload the .sql file here.</p>
        <button type="submit" class="danger">Import &amp; Replace Data</button>
      </form>
    </div>
  </div>
</body>
</html>`;
}

// ─── Helpers ────────────────────────────────────────────────────

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
