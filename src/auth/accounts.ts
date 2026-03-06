import bcrypt from 'bcrypt';
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
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;

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
      INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.email, passwordHash, now, now);

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
}
