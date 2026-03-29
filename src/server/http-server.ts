import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { ReminderService } from '../services/reminders.js';
import { ForgetfulTemplate } from '../db/forgetful-template.js';
import { UserSettingsService } from '../services/settings.js';
import { PushNotificationService } from '../services/push-notifications.js';
import { NotificationService } from '../services/notifications.js';

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

  // Forgetful mode: pre-build a template DB and track per-session clones
  const forgetfulTemplate = config.forgetful ? new ForgetfulTemplate() : null;
  // Map MCP sessionId → { userId, db } for forgetful mode (replaces OAuth)
  const forgetfulSessions = new Map<string, { userId: string; db: Database.Database }>();

  // Initialize auth services
  const accountService = new AccountService(db);
  const oauthService = new OAuthService(db, accountService);

  // Set up OAuth token verifier and bearer auth middleware for MCP endpoints
  const tokenVerifier = new McpTokenVerifier(oauthService);
  const bearerAuth = requireBearerAuth({ verifier: tokenVerifier });

  /** Forgetful-mode MCP middleware: bypasses OAuth entirely, maps sessions to cloned DBs */
  function forgetfulMcpAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — inject auth from stored session
    if (sessionId && forgetfulSessions.has(sessionId)) {
      const session = forgetfulSessions.get(sessionId)!;
      (req as any).auth = {
        token: 'forgetful', clientId: 'forgetful', scopes: [],
        expiresAt: Infinity, extra: { userId: session.userId },
      };
      next();
      return;
    }

    // New session (no session ID yet) — create user + clone DB
    if (!sessionId && isInitializeRequest(req.body)) {
      const userId = generateId();
      const clonedDb = forgetfulTemplate!.clone(userId);
      // Store temporarily on req for the POST handler to pick up after onsessioninitialized
      (req as any)._forgetfulSession = { userId, db: clonedDb };
      (req as any).auth = {
        token: 'forgetful', clientId: 'forgetful', scopes: [],
        expiresAt: Infinity, extra: { userId },
      };
      next();
      return;
    }

    // For non-init requests without a valid session, or GET/DELETE with unknown session
    res.status(401).json({ error: 'Invalid session' });
  }

  // Choose auth middleware based on mode
  const mcpAuth = config.forgetful ? forgetfulMcpAuth : bearerAuth;

  const app = express();

  // Set up EJS view engine
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

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
      res.redirect(`/web/login?redirect=${encodeURIComponent(req.originalUrl)}`);
      return;
    }
    const session = webSessions.get(sessionToken);
    if (!session) {
      // Expired/invalid session — clear cookie and redirect
      res.setHeader('Set-Cookie', 'mob_session=; Path=/; HttpOnly; Max-Age=0');
      res.redirect(`/web/login?redirect=${encodeURIComponent(req.originalUrl)}`);
      return;
    }
    // Attach user info to request for downstream use
    (req as any).webUser = session;
    next();
  }

  // ─── Homepage ──────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.render('homepage', { serverUrl, forgetful: config.forgetful });
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
      const { name, email, password, timezone } = req.body;
      const client_id = req.query.client_id as string;
      const code_challenge = req.query.code_challenge as string;
      const code_challenge_method = req.query.code_challenge_method as string;
      const redirect_uri = req.query.redirect_uri as string;
      const state = req.query.state as string;

      if (!name || !email || !password) {
        const originalUrl = req.originalUrl;
        res.status(400).render('register', { registerUrl: originalUrl, loginUrl: getLoginUrlFromRegister(originalUrl), error: 'Full name, email, and password are required' });
        return;
      }

      try {
        const user = await accountService.createAccount({ name, email, password, timezone });

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
          res.status(409).render('register', { registerUrl: req.originalUrl, loginUrl: getLoginUrlFromRegister(req.originalUrl), error: 'An account with that email already exists' });
        } else {
          res.status(500).render('register', { registerUrl: req.originalUrl, loginUrl: getLoginUrlFromRegister(req.originalUrl), error: 'Something went wrong. Please try again.' });
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
    res.render('register', { registerUrl: _req.originalUrl, loginUrl: getLoginUrlFromRegister(_req.originalUrl), error: undefined, success: undefined });
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

    // Persistent mode — show login form
    res.render('login', { authorizeUrl: req.originalUrl, registerUrl: req.originalUrl.replace('/auth/authorize', '/auth/register'), error: undefined });
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

    // In forgetful mode, no OAuth is needed for MCP — reject API auth requests
    if (config.forgetful) {
      res.status(404).json({ error: 'OAuth is disabled in forgetful mode. Connect to /mcp directly.' });
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
        res.status(401).render('login', { authorizeUrl: originalUrl, registerUrl: originalUrl.replace('/auth/authorize', '/auth/register'), error: 'Invalid email or password' });
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

  app.get('/web/login', (req, res) => {
    if (config.forgetful) {
      // Auto-login in forgetful mode
      const tempId = generateId();

      // Clone template DB for this web session
      const clonedDb = forgetfulTemplate!.clone(tempId);
      // Store in forgetfulSessions with a web-specific key
      const webSessionKey = `web-${tempId}`;
      forgetfulSessions.set(webSessionKey, { userId: tempId, db: clonedDb });

      const token = randomUUID();
      webSessions.set(token, { userId: tempId, userName: 'Bluey Heeler', email: `bluey-${tempId}@heeler.family` });
      res.setHeader('Set-Cookie', `mob_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
      res.redirect('/web/dashboard');
      return;
    }
    res.render('web-login', { error: undefined, redirect: req.query.redirect || '' });
  });

  app.post('/web/login', async (req, res) => {
    const { email, password } = req.body;
    const redirect = req.body.redirect || '';
    // Validate redirect is a relative path to prevent open redirects
    const safeRedirect = (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) ? redirect : '/web/dashboard';

    if (!email || !password) {
      res.status(400).render('web-login', { error: 'Email and password are required', redirect });
      return;
    }

    const user = await accountService.login(email, password);
    if (!user) {
      res.status(401).render('web-login', { error: 'Invalid email or password', redirect });
      return;
    }

    const token = randomUUID();
    webSessions.set(token, { userId: user.id, userName: user.name, email: user.email });
    res.setHeader('Set-Cookie', `mob_session=${token}; Path=/; HttpOnly; SameSite=Lax`);
    res.redirect(safeRedirect);
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
    res.render('dashboard', { userName: user.userName, error: undefined, success: undefined });
  });

  // ─── Push Notification Services ─────────────────────────────
  const pushService = new PushNotificationService(db);
  const settingsService = new UserSettingsService(db);

  // Store base URL in server_config for MCP tools to reference
  db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('base_url', ?)").run(serverUrl);

  // Initialize VAPID keys (only in persistent mode)
  if (!config.forgetful) {
    try {
      pushService.initVapid('noreply@mob-crm.local');
    } catch {
      // web-push may not be available in all environments
    }
  }

  // ─── Favicon ──────────────────────────────────────────────

  app.get('/favicon.svg', (_req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(__dirname, 'favicon.svg'));
  });

  app.get('/favicon-192.png', (_req, res) => {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(__dirname, 'favicon-192.png'));
  });

  app.get('/favicon.ico', (_req, res) => {
    res.redirect(301, '/favicon.svg');
  });

  // ─── Service Worker ────────────────────────────────────────

  app.get('/service-worker.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'service-worker.js'));
  });

  // ─── VAPID Public Key Endpoint ─────────────────────────────
  app.get('/api/vapid-public-key', (_req, res) => {
    try {
      const key = pushService.getVapidPublicKey();
      res.json({ publicKey: key });
    } catch {
      res.status(500).json({ error: 'Push notifications not configured' });
    }
  });

  // ─── Auto-Login ────────────────────────────────────────────
  app.get('/web/auto-login', (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).send('Missing token');
      return;
    }

    const userId = accountService.consumeAutoLoginToken(token);
    if (!userId) {
      res.status(401).send('Invalid or expired token');
      return;
    }

    const user = accountService.getPublicUser(userId);
    if (!user) {
      res.status(404).send('User not found');
      return;
    }

    const sessionToken = randomUUID();
    webSessions.set(sessionToken, { userId: user.id, userName: user.name, email: user.email });
    res.setHeader('Set-Cookie', `mob_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`);
    res.redirect(req.query.redirect as string || '/web/dashboard');
  });

  // ─── Push Notification Management Page ─────────────────────
  app.get('/web/notifications', (req, res) => {
    const token = req.query.token as string;

    // If token provided, auto-login first
    if (token) {
      const userId = accountService.consumeAutoLoginToken(token);
      if (userId) {
        const user = accountService.getPublicUser(userId);
        if (user) {
          const sessionToken = randomUUID();
          webSessions.set(sessionToken, { userId: user.id, userName: user.name, email: user.email });
          res.setHeader('Set-Cookie', `mob_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`);
          res.redirect('/web/notifications');
          return;
        }
      }
    }

    // Check session
    const sessionToken = parseCookie(req.headers.cookie ?? '', 'mob_session');
    if (!sessionToken || !webSessions.get(sessionToken)) {
      res.redirect('/web/login');
      return;
    }

    const session = webSessions.get(sessionToken)!;
    res.render('notifications', { userName: session.userName });
  });

  // ─── Push Subscription API ─────────────────────────────────
  app.post('/api/push/subscribe', express.json(), requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string };
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }
    const result = pushService.subscribe(user.userId, subscription);
    res.json({ success: true, id: result.id });
  });

  app.post('/api/push/unsubscribe', express.json(), requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string };
    const { endpoint } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: 'endpoint is required' });
      return;
    }
    pushService.unsubscribe(user.userId, endpoint);
    res.json({ success: true });
  });

  app.get('/api/push/subscriptions', requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string };
    const subscriptions = pushService.getSubscriptions(user.userId);
    res.json({ count: subscriptions.length });
  });

  // ─── Reminder Detail Page ──────────────────────────────────
  const reminderService = new ReminderService(db);

  app.get('/web/reminder/:id', requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string; userName: string };
    const reminder = reminderService.get(user.userId, req.params.id);
    if (!reminder) {
      res.status(404).send('Reminder not found');
      return;
    }

    const contact = db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?').get(reminder.contact_id) as { first_name: string; last_name: string | null } | undefined;
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'Unknown';
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = reminder.status === 'active' && reminder.reminder_date < today;

    res.render('reminder', {
      userName: user.userName,
      reminder,
      contactName,
      isOverdue,
      success: req.query.success || undefined,
    });
  });

  app.post('/web/reminder/:id/complete', requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string };
    const result = reminderService.complete(user.userId, req.params.id);
    if (!result) {
      res.status(404).send('Reminder not found');
      return;
    }
    res.redirect(`/web/reminder/${req.params.id}?success=${encodeURIComponent('Reminder marked as complete.')}`);
  });

  app.post('/web/reminder/:id/snooze', requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string };
    const days = parseInt(req.body.days) || 1;
    const newDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    const result = reminderService.snooze(user.userId, req.params.id, newDate);
    if (!result) {
      res.status(404).send('Reminder not found');
      return;
    }
    res.redirect(`/web/reminder/${req.params.id}?success=${encodeURIComponent(`Reminder snoozed until ${newDate}.`)}`);
  });

  app.post('/web/reminder/:id/dismiss', requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string };
    const success = reminderService.softDelete(user.userId, req.params.id);
    if (!success) {
      res.status(404).send('Reminder not found');
      return;
    }
    res.redirect(`/web/reminder/${req.params.id}?success=${encodeURIComponent('Reminder dismissed.')}`);
  });

  // ─── Monica Import ────────────────────────────────────────

  app.get('/web/import', requireWebSession, (req, res) => {
    const user = (req as any).webUser as { userId: string; userName: string; email: string };
    res.render('import', { userName: user.userName, error: undefined, success: undefined });
  });

  app.post('/web/import/monica', requireWebSession, upload.single('sqlfile'), (req, res) => {
    const user = (req as any).webUser as { userId: string; userName: string; email: string };

    if (!req.file) {
      res.status(400).render('import', { userName: user.userName, error: 'No file uploaded. Please select a SQL file.', success: undefined });
      return;
    }

    const sqlContent = req.file.buffer.toString('utf-8');

    if (!sqlContent.includes('INSERT') || sqlContent.length < 100) {
      res.status(400).render('import', { userName: user.userName, error: 'The file does not appear to be a valid Monica SQL export.', success: undefined });
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

      res.render('import', { userName: user.userName, error: undefined, success: `Import complete! Imported: ${summary}.${errorSummary}` });
    } catch (err: any) {
      res.status(500).render('import', { userName: user.userName, error: `Import failed: ${err.message}`, success: undefined });
    }
  });

  // ─── MCP Streamable HTTP: POST ─────────────────────────────
  // Disable nginx proxy buffering for all MCP endpoints so SSE streams
  // (including server-to-client requests like elicitation) are forwarded immediately.
  // We intercept writeHead because the SDK's transport fully takes over the response,
  // overwriting any headers set beforehand.
  app.use('/mcp', (_req, res, next) => {
    const origWriteHead = res.writeHead.bind(res);
    res.writeHead = function (statusCode: number, ...args: any[]) {
      res.setHeader('X-Accel-Buffering', 'no');
      return origWriteHead(statusCode, ...args);
    } as any;
    next();
  });

  app.post('/mcp', mcpAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — reuse its transport
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // New session — only allowed for initialization requests
    if (isInitializeRequest(req.body)) {
      // If client sent an old session ID (e.g. after server restart), ignore it
      // and create a fresh session.
      // Determine which DB to use for this MCP session
      const mcpDb = config.forgetful
        ? (req as any)._forgetfulSession?.db
        : db;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
          // In forgetful mode, map the MCP session ID to the user/DB
          if (config.forgetful && (req as any)._forgetfulSession) {
            forgetfulSessions.set(sid, (req as any)._forgetfulSession);
          }
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          // Clean up forgetful DB clone when transport closes
          if (config.forgetful && forgetfulSessions.has(transport.sessionId)) {
            const session = forgetfulSessions.get(transport.sessionId)!;
            try { session.db.close(); } catch { /* already closed */ }
            forgetfulSessions.delete(transport.sessionId);
          }
        }
      };

      const server = createMcpServer(mcpDb);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Invalid request — non-init request without valid session
    // Return 404 for stale session IDs so clients know to re-initialize
    const status = sessionId ? 404 : 400;
    res.status(status).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: sessionId ? 'Not Found: Session expired or unknown' : 'Bad Request: Not an initialization request' },
      id: null,
    });
  });

  // ─── MCP Streamable HTTP: GET (SSE stream) ─────────────────
  app.get('/mcp', mcpAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res);
    } else {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Not Found: Session expired or unknown' },
        id: null,
      });
    }
  });

  // ─── MCP Streamable HTTP: DELETE (session termination) ──────
  app.delete('/mcp', mcpAuth, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res);
    } else {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Not Found: Session expired or unknown' },
        id: null,
      });
    }
  });

  // ─── Server Lifecycle ──────────────────────────────────────
  let httpServer: ReturnType<typeof app.listen>;

  // Clean up expired tokens periodically
  const cleanupInterval = setInterval(() => {
    oauthService.cleanup();
    accountService.cleanupAutoLoginTokens();
  }, 5 * 60 * 1000);

  // Birthday reminder scheduler (every 15 minutes, persistent mode only)
  let birthdaySchedulerInterval: ReturnType<typeof setInterval> | null = null;
  if (!config.forgetful) {
    const notificationService = new NotificationService(db);

    const runBirthdayScheduler = async () => {
      try {
        const users = db.prepare('SELECT id FROM users').all() as { id: string }[];
        for (const user of users) {
          const settings = settingsService.get(user.id);
          const now = new Date();

          // Convert current time to user's timezone
          const userTime = new Intl.DateTimeFormat('en-US', {
            timeZone: settings.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(now);

          // Check if current time (HH:MM) matches their reminder time (within 15-minute window)
          const [currentHour, currentMin] = userTime.split(':').map(Number);
          const [reminderHour, reminderMin] = settings.birthday_reminder_time.split(':').map(Number);
          const currentMins = currentHour * 60 + currentMin;
          const reminderMins = reminderHour * 60 + reminderMin;

          if (currentMins >= reminderMins && currentMins < reminderMins + 15) {
            const notifications = notificationService.generateBirthdayNotifications(user.id, undefined, settings.timezone);
            for (const notification of notifications) {
              try {
                const result = await pushService.sendPushNotification(
                  notification.user_id,
                  notification.title,
                  notification.body || '',
                  '/web/dashboard'
                );
                notificationService.recordPushResult(notification.id, result.sent > 0);
                if (result.sent === 0 && result.failed > 0) {
                  console.error(`Push delivery failed for notification ${notification.id} ("${notification.title}"): ${result.failed} subscription(s) failed`);
                }
              } catch (err) {
                notificationService.recordPushResult(notification.id, false);
                console.error(`Push send error for notification ${notification.id}:`, err);
              }
            }
          }

          // Retry failed pushes (runs every tick, not just during reminder window)
          const retries = notificationService.getPendingPushRetries(user.id);
          for (const notification of retries) {
            try {
              const result = await pushService.sendPushNotification(
                notification.user_id,
                notification.title,
                notification.body || '',
                '/web/dashboard'
              );
              notificationService.recordPushResult(notification.id, result.sent > 0);
              if (result.sent === 0 && result.failed > 0) {
                console.error(`Push retry failed for notification ${notification.id} ("${notification.title}"): ${result.failed} subscription(s) failed`);
              }
            } catch (err) {
              notificationService.recordPushResult(notification.id, false);
              console.error(`Push retry error for notification ${notification.id}:`, err);
            }
          }
        }
      } catch (err) {
        console.error('Birthday scheduler error:', err);
      }
    };

    birthdaySchedulerInterval = setInterval(runBirthdayScheduler, 15 * 60 * 1000);

    // Reminder push notification scheduler (every 15 minutes)
    const runReminderScheduler = async () => {
      try {
        const users = db.prepare('SELECT id FROM users').all() as { id: string }[];
        for (const user of users) {
          const settings = settingsService.get(user.id);
          const now = new Date();

          // Convert current time to user's timezone
          const userTime = new Intl.DateTimeFormat('en-US', {
            timeZone: settings.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(now);

          // Use the same reminder time window as birthdays
          const [currentHour, currentMin] = userTime.split(':').map(Number);
          const [reminderHour, reminderMin] = settings.birthday_reminder_time.split(':').map(Number);
          const currentMins = currentHour * 60 + currentMin;
          const reminderMins = reminderHour * 60 + reminderMin;

          if (currentMins >= reminderMins && currentMins < reminderMins + 15) {
            // Get today's date in user's timezone
            const userToday = new Intl.DateTimeFormat('en-CA', {
              timeZone: settings.timezone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(now); // en-CA gives YYYY-MM-DD format

            // Find active reminders due today or overdue
            const dueReminders = db.prepare(`
              SELECT r.*, c.first_name, c.last_name
              FROM reminders r
              JOIN contacts c ON r.contact_id = c.id
              WHERE r.deleted_at IS NULL AND c.deleted_at IS NULL
                AND c.user_id = ?
                AND r.status = 'active'
                AND r.reminder_date <= ?
            `).all(user.id, userToday) as any[];

            for (const reminder of dueReminders) {
              const contactName = [reminder.first_name, reminder.last_name].filter(Boolean).join(' ');
              const isOverdue = reminder.reminder_date < userToday;
              const title = isOverdue ? `Overdue: ${reminder.title}` : `Reminder: ${reminder.title}`;
              const body = contactName + (reminder.description ? ` — ${reminder.description}` : '');

              try {
                await pushService.sendPushNotification(
                  user.id,
                  title,
                  body,
                  `/web/reminder/${reminder.id}`
                );
              } catch {
                // Push send failure is non-fatal
              }
            }
          }
        }
      } catch (err) {
        console.error('Reminder scheduler error:', err);
      }
    };

    setInterval(runReminderScheduler, 15 * 60 * 1000);
  }

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
      if (birthdaySchedulerInterval) clearInterval(birthdaySchedulerInterval);
      // Close all active transports
      for (const [sid, transport] of Object.entries(transports)) {
        transport.close();
        delete transports[sid];
      }
      // Close database
      db.close();
      // Close all forgetful DB clones
      for (const [key, session] of forgetfulSessions) {
        try { session.db.close(); } catch { /* already closed */ }
        forgetfulSessions.delete(key);
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

// ─── Helpers ────────────────────────────────────────────────────

function getLoginUrlFromRegister(registerUrl: string): string {
  const isWebFlow = registerUrl.includes('from=web');
  return isWebFlow ? '/web/login' : registerUrl.replace('/auth/register', '/auth/authorize');
}

function parseCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
