import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

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
}
