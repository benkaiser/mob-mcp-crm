import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { UserSettingsService } from '../services/settings.js';

// ─── Types ──────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountInput {
  name: string;
  email: string;
  password: string;
  timezone?: string;
  /** Initial plan. Defaults to 'unlimited' (self-hosted). Hosted signups pass 'free'. */
  plan?: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

/** A pending, not-yet-confirmed email address plus verification state. */
export interface AccountVerification {
  email_verified: boolean;
  pending_email: string | null;
}

/** Minimal user identity used when emailing (reset / verification links). */
export interface UserContact {
  id: string;
  name: string;
  email: string;
}

/**
 * Error thrown by account operations. Carries an HTTP `status` and machine
 * `code` so the internal API error handler can render a structured response.
 */
export class AccountError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'AccountError';
  }
}

// ─── Constants ──────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;
/** Minimum password length enforced on change/reset (and recommended on signup). */
export const MIN_PASSWORD_LENGTH = 8;
/** Password reset links expire after 1 hour. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Email verification links expire after 24 hours. */
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ─── Service ────────────────────────────────────────────────────

export class AccountService {
  constructor(private db: Database.Database) {}

  async createAccount(input: CreateAccountInput): Promise<PublicUser> {
    // Check for duplicate email
    const existing = this.db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(input.email);

    if (existing) {
      throw new Error('An account with this email already exists');
    }

    const id = generateId();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO users (id, name, email, password_hash, plan, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.email, passwordHash, input.plan ?? 'unlimited', now, now);

    // Auto-create self-contact so the user can participate in relationships
    const selfContactId = generateId();
    const nameParts = input.name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    this.db.prepare(`
      INSERT INTO contacts (id, user_id, first_name, last_name, is_me, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(selfContactId, id, firstName, lastName, now, now);

    // Auto-create user settings with detected timezone
    const settingsService = new UserSettingsService(this.db);
    settingsService.createDefaults(id, input.timezone);

    return this.getPublicUser(id)!;
  }

  async login(email: string, password: string): Promise<PublicUser | null> {
    const user = this.db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).get(email) as User | undefined;

    if (!user) return null;

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at,
    };
  }

  getPublicUser(id: string): PublicUser | null {
    const user = this.db.prepare(
      'SELECT id, name, email, created_at FROM users WHERE id = ?'
    ).get(id) as PublicUser | undefined;

    return user ?? null;
  }

  /**
   * Create a short-lived auto-login token for bridging MCP to web sessions.
   */
  createAutoLoginToken(userId: string): string {
    const token = generateId() + generateId(); // 16-char token
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    this.db.prepare(`
      INSERT INTO auto_login_tokens (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(token, userId, expiresAt);

    return token;
  }

  /**
   * Validate and consume an auto-login token. Returns userId if valid.
   */
  consumeAutoLoginToken(token: string): string | null {
    const row = this.db.prepare(
      'SELECT user_id, expires_at FROM auto_login_tokens WHERE token = ?'
    ).get(token) as { user_id: string; expires_at: string } | undefined;

    if (!row) return null;

    // Delete the token (single-use)
    this.db.prepare('DELETE FROM auto_login_tokens WHERE token = ?').run(token);

    // Check expiry
    if (new Date(row.expires_at) < new Date()) return null;

    return row.user_id;
  }

  /**
   * Clean up expired auto-login tokens.
   */
  cleanupAutoLoginTokens(): void {
    this.db.prepare(
      "DELETE FROM auto_login_tokens WHERE expires_at < datetime('now')"
    ).run();
  }

  // ─── Verification state ───────────────────────────────────────

  /** Get email-verification state for a user (used by /me). */
  getVerification(userId: string): AccountVerification {
    const row = this.db.prepare(
      'SELECT email_verified_at, pending_email FROM users WHERE id = ?'
    ).get(userId) as { email_verified_at: string | null; pending_email: string | null } | undefined;
    return {
      email_verified: Boolean(row?.email_verified_at),
      pending_email: row?.pending_email ?? null,
    };
  }

  // ─── Password change (logged in) ──────────────────────────────

  /**
   * Change a logged-in user's password after verifying their current one.
   * Throws AccountError on a wrong current password or a too-short new password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new AccountError(422, 'weak_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const user = this.db.prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(userId) as { password_hash: string } | undefined;
    if (!user) throw new AccountError(404, 'not_found', 'Account not found');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new AccountError(400, 'invalid_password', 'Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    this.db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hash, userId);
  }

  /** Verify a user's password (used for re-auth on destructive actions). */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const user = this.db.prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(userId) as { password_hash: string } | undefined;
    if (!user) return false;
    return bcrypt.compare(password, user.password_hash);
  }

  // ─── Profile editing ──────────────────────────────────────────

  /** Update the account's display name. Throws on an empty name. */
  updateName(userId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new AccountError(422, 'validation_error', 'Name cannot be empty');
    this.db.prepare("UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(trimmed, userId);
  }

  /**
   * Begin an email change: validate the new address, ensure it isn't already
   * taken, store it as `pending_email`, and mint a verification token. The raw
   * token is returned for the caller to email; the swap happens on confirmation.
   */
  requestEmailChange(userId: string, newEmail: string): { token: string; user: UserContact } {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      throw new AccountError(422, 'validation_error', 'Please enter a valid email address');
    }
    const user = this.db.prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(userId) as UserContact | undefined;
    if (!user) throw new AccountError(404, 'not_found', 'Account not found');

    if (email === user.email.toLowerCase()) {
      throw new AccountError(409, 'email_unchanged', 'That is already your email address');
    }
    const taken = this.db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?')
      .get(email, userId);
    if (taken) throw new AccountError(409, 'email_taken', 'An account with this email already exists');

    this.db.prepare("UPDATE users SET pending_email = ?, updated_at = datetime('now') WHERE id = ?")
      .run(email, userId);

    const token = this.createEmailVerificationToken(userId, email);
    return { token, user: { id: user.id, name: user.name, email } };
  }

  // ─── Email verification ───────────────────────────────────────

  /**
   * Create a single-use email verification token. Pass `newEmail` for an
   * email-change confirmation, or null for initial (signup) verification.
   * Returns the raw token (only the hash is stored).
   */
  createEmailVerificationToken(userId: string, newEmail: string | null = null): string {
    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString();
    this.db.prepare(`
      INSERT INTO email_verification_tokens (token_hash, user_id, new_email, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(hashToken(raw), userId, newEmail, expiresAt);
    return raw;
  }

  /**
   * Consume a verification token: mark the email verified, swapping in a
   * pending email address if the token carried one. Throws AccountError when
   * the token is missing, already used, or expired.
   */
  verifyEmailToken(rawToken: string): { userId: string; email: string } {
    const row = this.db.prepare(`
      SELECT token_hash, user_id, new_email, expires_at, used_at
      FROM email_verification_tokens WHERE token_hash = ?
    `).get(hashToken(rawToken)) as
      { token_hash: string; user_id: string; new_email: string | null; expires_at: string; used_at: string | null } | undefined;

    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      throw new AccountError(400, 'invalid_token', 'This verification link is invalid or has expired');
    }

    const applyEmailChange = row.new_email
      ? this.db.prepare("UPDATE users SET email = ?, pending_email = NULL, email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      : null;

    const tx = this.db.transaction(() => {
      if (applyEmailChange) {
        applyEmailChange.run(row.new_email, row.user_id);
      } else {
        this.db.prepare("UPDATE users SET email_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
          .run(row.user_id);
      }
      this.db.prepare("UPDATE email_verification_tokens SET used_at = datetime('now') WHERE token_hash = ?")
        .run(row.token_hash);
    });
    tx();

    const user = this.db.prepare('SELECT email FROM users WHERE id = ?')
      .get(row.user_id) as { email: string } | undefined;
    return { userId: row.user_id, email: user?.email ?? '' };
  }

  /**
   * Mint a fresh verification token for a resend. Targets the pending email if
   * an email change is in flight, otherwise the current (unverified) address.
   * Returns the raw token plus the recipient details.
   */
  resendVerification(userId: string): { token: string; user: UserContact } {
    const user = this.db.prepare('SELECT id, name, email, pending_email FROM users WHERE id = ?')
      .get(userId) as (UserContact & { pending_email: string | null }) | undefined;
    if (!user) throw new AccountError(404, 'not_found', 'Account not found');

    const target = user.pending_email ?? user.email;
    const token = this.createEmailVerificationToken(userId, user.pending_email ?? null);
    return { token, user: { id: user.id, name: user.name, email: target } };
  }

  // ─── Password reset (forgot password) ─────────────────────────

  /**
   * Create a single-use password reset token for the account with the given
   * email. Returns null if no such account exists (callers MUST respond
   * generically either way to avoid account enumeration). Only the token hash
   * is stored; the raw token is returned for emailing.
   */
  createPasswordResetToken(email: string): { token: string; user: UserContact } | null {
    const user = this.db.prepare('SELECT id, name, email FROM users WHERE lower(email) = ?')
      .get(email.trim().toLowerCase()) as UserContact | undefined;
    if (!user) return null;

    const raw = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    this.db.prepare(`
      INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(hashToken(raw), user.id, expiresAt);

    return { token: raw, user };
  }

  /**
   * Reset a password using a token from `createPasswordResetToken`. Validates
   * the token (exists, unused, unexpired) and new password length, updates the
   * hash, marks the token used, and invalidates all outstanding reset tokens
   * for the user. Returns the affected userId (for session revocation).
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<string> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new AccountError(422, 'weak_password', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const row = this.db.prepare(`
      SELECT token_hash, user_id, expires_at, used_at
      FROM password_reset_tokens WHERE token_hash = ?
    `).get(hashToken(rawToken)) as
      { token_hash: string; user_id: string; expires_at: string; used_at: string | null } | undefined;

    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      throw new AccountError(400, 'invalid_token', 'This reset link is invalid or has expired');
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
        .run(hash, row.user_id);
      // Invalidate every outstanding reset token for this user.
      this.db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL")
        .run(row.user_id);
    });
    tx();
    return row.user_id;
  }

  /** Clean up expired/used reset and verification tokens. */
  cleanupAccountTokens(): void {
    this.db.prepare("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used_at IS NOT NULL").run();
    this.db.prepare("DELETE FROM email_verification_tokens WHERE expires_at < datetime('now') OR used_at IS NOT NULL").run();
  }

  // ─── Account deletion ─────────────────────────────────────────

  /**
   * Permanently (hard) delete an account and all owned data. Every user-owned
   * table declares `ON DELETE CASCADE` from users(id) and foreign keys are
   * enabled, so a single delete inside a transaction wipes contacts,
   * sub-entities, sessions, OAuth tokens, settings, API tokens, webhooks, etc.
   * Returns true if a row was removed.
   */
  deleteAccount(userId: string): boolean {
    const tx = this.db.transaction(() => {
      return this.db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes;
    });
    return tx() > 0;
  }
}
