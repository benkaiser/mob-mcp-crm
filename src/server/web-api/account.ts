import { Router } from 'express';
import { z } from 'zod';
import { AccountService, AccountError } from '../../auth/accounts.js';
import { OAuthService } from '../../auth/oauth.js';
import { SessionService } from '../../services/sessions.js';
import { UserSettingsService } from '../../services/settings.js';
import { ApiTokenService } from '../../services/api-tokens.js';
import { EmailService, renderActionEmail, renderNoticeEmail } from '../../services/email.js';
import { MatrixService, isMatrixConfigured } from '../../services/matrix.js';
import {
  asyncHandler,
  sendData,
  ApiError,
  parseBody,
  getUserId,
} from './helpers.js';

export interface AccountRouterDeps {
  accountService: AccountService;
  sessionService: SessionService;
  oauthService: OAuthService;
  apiTokenService: ApiTokenService;
  settingsService: UserSettingsService;
  emailService: EmailService;
  baseUrl: string;
  cookieSecure: boolean;
  /** Forgetful mode has ephemeral in-memory sessions and no real user rows. */
  forgetful: boolean;
}

const passwordSchema = z.object({
  current_password: z.string().min(1, 'current_password is required'),
  new_password: z.string().min(1, 'new_password is required'),
}).strict();

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  // Required whenever `email` is present (re-auth for a security-sensitive
  // change) - see the `.refine` below.
  current_password: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
}).strict().refine(
  (input) => input.email === undefined || (input.current_password?.length ?? 0) > 0,
  { message: 'current_password is required to change your email address', path: ['current_password'] },
);

const deleteSchema = z.object({
  password: z.string().min(1, 'password is required'),
  confirm_email: z.string().min(1, 'confirm_email is required'),
}).strict();

// Advance-notice offsets are a non-empty list of whole days (>= 0) before the
// due date to notify. Time is 24-hour HH:MM.
const offsetsSchema = z.array(z.number().int().min(0)).min(1, 'at least one offset is required');
const settingsSchema = z.object({
  reminder_offsets: offsetsSchema.optional(),
  birthday_reminder_offsets: offsetsSchema.optional(),
  birthday_reminder_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'time must be HH:MM (24-hour)').optional(),
  timezone: z.string().min(1).optional(),
  // Matrix notification target. An empty string clears a field; the homeserver
  // URL is validated (and mapped to 422) by the settings service.
  matrix_homeserver: z.string().optional(),
  matrix_access_token: z.string().optional(),
  matrix_room_id: z.string().optional(),
}).strict();

/**
 * Shape returned to the Settings UI (omits internal columns). The Matrix access
 * token is write-only: we surface whether Matrix is configured and the
 * non-secret homeserver/room, but never echo the token back to the client.
 */
function publicSettings(s: {
  timezone: string;
  birthday_reminder_time: string;
  birthday_reminder_offsets: number[];
  reminder_offsets: number[];
  matrix_homeserver: string | null;
  matrix_access_token: string | null;
  matrix_room_id: string | null;
}) {
  return {
    timezone: s.timezone,
    birthday_reminder_time: s.birthday_reminder_time,
    birthday_reminder_offsets: s.birthday_reminder_offsets,
    reminder_offsets: s.reminder_offsets,
    matrix_homeserver: s.matrix_homeserver,
    matrix_room_id: s.matrix_room_id,
    matrix_configured: isMatrixConfigured({
      homeserver: s.matrix_homeserver ?? '',
      accessToken: s.matrix_access_token ?? '',
      roomId: s.matrix_room_id ?? '',
    }),
  };
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Account self-service router, mounted at `/web/api/account`. Session-cookie
 * authenticated + CSRF-protected (applied by the parent web-api router).
 * Covers password change, profile editing, email verification, connected AI
 * assistants, active web sessions and hard account deletion.
 */
export function createAccountRouter(deps: AccountRouterDeps): Router {
  const { accountService, sessionService, oauthService, apiTokenService, settingsService, emailService, baseUrl, cookieSecure, forgetful } = deps;
  const router = Router();
  const matrixService = new MatrixService();

  const currentToken = (req: import('express').Request): string =>
    parseCookie(req.headers.cookie ?? '', 'mob_session') ?? '';

  // Account management operates on the persistent users/sessions tables, which
  // don't exist for ephemeral forgetful-mode users.
  const requirePersistent = () => {
    if (forgetful) throw new ApiError(400, 'unavailable', 'Account management is not available in forgetful mode');
  };

  async function sendVerificationEmail(user: { name: string; email: string }, token: string): Promise<void> {
    const url = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
    const { text, html } = renderActionEmail({
      title: 'Verify your email',
      intro: `Hi ${user.name}, please confirm your email address for Mob.`,
      buttonLabel: 'Verify email',
      url,
      outro: "If you didn't request this, you can safely ignore this email.",
    });
    await emailService.sendMail({ to: user.email, subject: 'Verify your Mob email', text, html });
  }

  // Heads-up sent to the OLD address whenever an email change is requested, so
  // the real owner finds out even if an attacker (e.g. via a stolen session)
  // is the one who initiated it.
  async function sendEmailChangeNotice(user: { name: string; email: string }, newEmail: string): Promise<void> {
    const { text, html } = renderNoticeEmail({
      title: 'Your Mob email address is changing',
      intro: `Hi ${user.name}, someone requested to change your Mob account email to ${newEmail}. This won't take effect until it's verified from the new address.`,
      outro: "If this wasn't you, change your password immediately and contact support.",
    });
    await emailService.sendMail({ to: user.email, subject: 'Your Mob email address is changing', text, html });
  }

  // ─── Change password ──────────────────────────────────────────
  router.post('/password', asyncHandler(async (req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(passwordSchema, req);
    await accountService.changePassword(userId, input.current_password, input.new_password);
    // Security: a password change means the old password (and anything an
    // attacker minted with it) can no longer be trusted. Boot every other web
    // session, and revoke every MCP/API credential (OAuth access tokens and
    // long-lived API tokens) so a compromised account is actually evicted.
    sessionService.destroyAllForUserExcept(userId, currentToken(req));
    oauthService.revokeAllForUser(userId);
    apiTokenService.revokeAllForUser(userId);
    sendData(res, { ok: true });
  }));

  // ─── Edit profile (name / timezone / email) ───────────────────
  router.patch('/profile', asyncHandler(async (req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(profileSchema, req);

    if (input.name !== undefined) {
      accountService.updateName(userId, input.name);
    }

    if (input.timezone !== undefined) {
      try {
        settingsService.update(userId, { timezone: input.timezone });
      } catch (err) {
        throw new ApiError(422, 'validation_error', (err as Error).message);
      }
    }

    let emailChangePending = false;
    if (input.email !== undefined) {
      // Re-auth: email is a security-sensitive credential (used for password
      // resets and account recovery), so require the current password before
      // repointing it - same bar as account deletion.
      const currentUser = accountService.getPublicUser(userId);
      if (!currentUser) throw new ApiError(404, 'not_found', 'Account not found');
      const valid = await accountService.verifyPassword(userId, input.current_password ?? '');
      if (!valid) throw new ApiError(400, 'invalid_password', 'Current password is incorrect');

      const { token, user } = accountService.requestEmailChange(userId, input.email);
      await sendVerificationEmail(user, token);
      // Notify the OLD address too, so the real owner is never left in the
      // dark about a change they may not have made.
      await sendEmailChangeNotice(currentUser, user.email);
      emailChangePending = true;
    }

    const verification = accountService.getVerification(userId);
    sendData(res, {
      ok: true,
      email_change_pending: emailChangePending,
      pending_email: verification.pending_email,
    });
  }));

  // ─── Notification settings (reminder/birthday offsets + time) ──
  router.get('/settings', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    sendData(res, publicSettings(settingsService.get(userId)));
  }));

  router.patch('/settings', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(settingsSchema, req);
    try {
      const updated = settingsService.update(userId, input);
      sendData(res, publicSettings(updated));
    } catch (err) {
      throw new ApiError(422, 'validation_error', (err as Error).message);
    }
  }));

  // Send a test message to the configured Matrix room, so the user can confirm
  // their homeserver/token/room before relying on it for notifications.
  router.post('/settings/matrix/test', asyncHandler(async (req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const s = settingsService.get(userId);
    const config = {
      homeserver: s.matrix_homeserver ?? '',
      accessToken: s.matrix_access_token ?? '',
      roomId: s.matrix_room_id ?? '',
    };
    if (!isMatrixConfigured(config)) {
      throw new ApiError(400, 'matrix_not_configured', 'Set a homeserver, access token and room id before sending a test message');
    }
    const result = await matrixService.send(config, {
      text: '🦘 Mob test message — your Matrix notifications are working.',
    });
    if (!result.sent) {
      throw new ApiError(502, 'matrix_error', result.error ?? 'Failed to send Matrix message');
    }
    sendData(res, { sent: true });
  }));

  // ─── Resend verification email ────────────────────────────────
  router.post('/resend-verification', asyncHandler(async (req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const { token, user } = accountService.resendVerification(userId);
    await sendVerificationEmail(user, token);
    sendData(res, { ok: true, email: user.email });
  }));

  // ─── Connected AI assistants (OAuth clients) ──────────────────
  router.get('/connections', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const connections = oauthService.listConnectionsForUser(userId).map((c) => ({
      client_id: c.clientId,
      token_count: c.tokenCount,
      authorized_at: c.authorizedAt,
      last_used_at: c.lastUsedAt,
      expires_at: new Date(c.expiresAt).toISOString(),
    }));
    sendData(res, connections);
  }));

  router.delete('/connections/:clientId', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const clientId = Array.isArray(req.params.clientId) ? req.params.clientId[0] : req.params.clientId;
    const removed = oauthService.revokeConnection(userId, clientId);
    if (removed === 0) throw new ApiError(404, 'not_found', 'Connection not found');
    sendData(res, { client_id: clientId, revoked: true });
  }));

  // ─── Active web sessions ──────────────────────────────────────
  router.get('/sessions', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const current = sessionService.publicId(currentToken(req));
    const sessions = sessionService.listForUser(userId).map((s) => ({
      id: s.id,
      current: s.id === current,
      created_at: s.createdAt,
      last_seen_at: s.lastSeenAt,
      user_agent: s.userAgent,
      ip: s.ip,
    }));
    sendData(res, sessions);
  }));

  router.delete('/sessions/:id', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const ok = sessionService.destroyForUserByPublicId(userId, id);
    if (!ok) throw new ApiError(404, 'not_found', 'Session not found');
    sendData(res, { id, revoked: true });
  }));

  // Revoke all sessions except the current one ("log out everywhere else").
  router.post('/sessions/revoke-all', asyncHandler((req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const removed = sessionService.destroyAllForUserExcept(userId, currentToken(req));
    sendData(res, { revoked: removed });
  }));

  // ─── Hard account deletion ────────────────────────────────────
  router.delete('/', asyncHandler(async (req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const session = (req as unknown as { webUser: { email: string } }).webUser;
    const input = parseBody(deleteSchema, req);

    // Explicit confirmation: the typed email must match, and the password must
    // re-authenticate. Both guard against accidental / CSRF-driven deletion.
    if (input.confirm_email.trim().toLowerCase() !== session.email.toLowerCase()) {
      throw new ApiError(400, 'confirm_mismatch', 'The email you entered does not match your account');
    }
    const valid = await accountService.verifyPassword(userId, input.password);
    if (!valid) throw new ApiError(400, 'invalid_password', 'Password is incorrect');

    accountService.deleteAccount(userId); // cascade wipes all owned data + sessions/tokens
    res.setHeader('Set-Cookie', `mob_session=; Path=/; HttpOnly; Max-Age=0${cookieSecure ? '; Secure' : ''}`);
    sendData(res, { deleted: true });
  }));

  // Translate AccountError into the standard error envelope.
  router.use((err: unknown, _req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    if (err instanceof AccountError) {
      next(new ApiError(err.status, err.code, err.message));
      return;
    }
    next(err);
  });

  return router;
}
