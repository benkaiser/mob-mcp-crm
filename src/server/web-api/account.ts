import { Router } from 'express';
import { z } from 'zod';
import { AccountService, AccountError } from '../../auth/accounts.js';
import { OAuthService } from '../../auth/oauth.js';
import { SessionService } from '../../services/sessions.js';
import { UserSettingsService } from '../../services/settings.js';
import { EmailService, renderActionEmail } from '../../services/email.js';
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
  timezone: z.string().min(1).optional(),
}).strict();

const deleteSchema = z.object({
  password: z.string().min(1, 'password is required'),
  confirm_email: z.string().min(1, 'confirm_email is required'),
}).strict();

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
  const { accountService, sessionService, oauthService, settingsService, emailService, baseUrl, cookieSecure, forgetful } = deps;
  const router = Router();

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

  // ─── Change password ──────────────────────────────────────────
  router.post('/password', asyncHandler(async (req, res) => {
    requirePersistent();
    const userId = getUserId(req);
    const input = parseBody(passwordSchema, req);
    await accountService.changePassword(userId, input.current_password, input.new_password);
    // Security: boot every other session, keep the current browser signed in.
    sessionService.destroyAllForUserExcept(userId, currentToken(req));
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
      const { token, user } = accountService.requestEmailChange(userId, input.email);
      await sendVerificationEmail(user, token);
      emailChangePending = true;
    }

    const verification = accountService.getVerification(userId);
    sendData(res, {
      ok: true,
      email_change_pending: emailChangePending,
      pending_email: verification.pending_email,
    });
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
