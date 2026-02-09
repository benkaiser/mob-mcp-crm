/**
 * Shared test helpers for Mob CRM tests.
 */
import Database from 'better-sqlite3';
import { createDatabase } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrator.js';

/**
 * Creates a fresh in-memory database with all migrations applied.
 * Each call returns a completely isolated database instance.
 */
export function createTestDatabase(): Database.Database {
  const db = createDatabase({ dataDir: ':memory:', inMemory: true });
  runMigrations(db);
  return db;
}

/**
 * Creates a test user and returns the user ID.
 * Useful for tests that need an authenticated user context.
 */
export function createTestUser(db: Database.Database, overrides: Partial<{
  name: string;
  email: string;
  passwordHash: string;
}> = {}): string {
  const id = Math.random().toString(36).substring(2, 18);
  const name = overrides.name || 'Test User';
  const email = overrides.email || `test-${id}@example.com`;
  const passwordHash = overrides.passwordHash || '$2b$10$fakehashfortesting';

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash)
    VALUES (?, ?, ?, ?)
  `).run(id, name, email, passwordHash);

  return id;
}

/**
 * Creates a test contact and returns the contact ID.
 */
export function createTestContact(db: Database.Database, userId: string, overrides: Partial<{
  firstName: string;
  lastName: string;
  status: string;
  isFavorite: boolean;
}> = {}): string {
  const id = Math.random().toString(36).substring(2, 18);
  const firstName = overrides.firstName || 'Jane';
  const lastName = overrides.lastName || 'Doe';
  const status = overrides.status || 'active';
  const isFavorite = overrides.isFavorite ? 1 : 0;

  db.prepare(`
    INSERT INTO contacts (id, user_id, first_name, last_name, status, is_favorite)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, firstName, lastName, status, isFavorite);

  return id;
}

/**
 * Creates a test server configuration for tests.
 */
export function createTestConfig() {
  return {
    port: 0, // random port for tests
    dataDir: ':memory:',
    forgetful: false,
  };
}
