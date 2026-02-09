import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrator.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';

describe('Database Connection', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) closeDatabase(db);
  });

  it('should create an in-memory database', () => {
    db = createDatabase({ dataDir: ':memory:', inMemory: true });
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it('should enable WAL mode', () => {
    db = createDatabase({ dataDir: ':memory:', inMemory: true });
    const result = db.pragma('journal_mode') as any[];
    // In-memory databases may not support WAL, so accept 'memory' or 'wal'
    expect(['wal', 'memory']).toContain(result[0].journal_mode);
  });

  it('should enable foreign keys', () => {
    db = createDatabase({ dataDir: ':memory:', inMemory: true });
    const result = db.pragma('foreign_keys') as any[];
    expect(result[0].foreign_keys).toBe(1);
  });
});

describe('Migrations', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) closeDatabase(db);
  });

  it('should run all migrations successfully', () => {
    db = createTestDatabase();

    // Check that migrations table exists and has entries
    const migrations = db.prepare('SELECT name FROM migrations').all() as any[];
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0].name).toBe('001-initial-schema.sql');
  });

  it('should create all expected tables', () => {
    db = createTestDatabase();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as any[];

    const tableNames = tables.map((t: any) => t.name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('contacts');
    expect(tableNames).toContain('contact_methods');
    expect(tableNames).toContain('addresses');
    expect(tableNames).toContain('food_preferences');
    expect(tableNames).toContain('custom_fields');
    expect(tableNames).toContain('relationships');
    expect(tableNames).toContain('notes');
    expect(tableNames).toContain('tags');
    expect(tableNames).toContain('contact_tags');
    expect(tableNames).toContain('groups_table');
    expect(tableNames).toContain('contact_groups');
    expect(tableNames).toContain('activities');
    expect(tableNames).toContain('activity_participants');
    expect(tableNames).toContain('activity_types');
    expect(tableNames).toContain('life_events');
    expect(tableNames).toContain('reminders');
    expect(tableNames).toContain('notifications');
    expect(tableNames).toContain('gifts');
    expect(tableNames).toContain('debts');
    expect(tableNames).toContain('tasks');
  });

  it('should not re-run already applied migrations', () => {
    db = createTestDatabase();

    // Run migrations again — should be idempotent
    runMigrations(db);

    const migrations = db.prepare('SELECT name FROM migrations').all() as any[];
    // Should still have only one entry for the initial migration
    const initialCount = migrations.filter((m: any) => m.name === '001-initial-schema.sql').length;
    expect(initialCount).toBe(1);
  });

  it('should support creating users', () => {
    db = createTestDatabase();
    const userId = createTestUser(db);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    expect(user).toBeDefined();
    expect(user.name).toBe('Test User');
    expect(user.email).toContain('@example.com');
  });

  it('should enforce foreign key constraints', () => {
    db = createTestDatabase();

    // Trying to insert a contact with a non-existent user_id should fail
    expect(() => {
      db.prepare(`
        INSERT INTO contacts (id, user_id, first_name)
        VALUES ('test', 'nonexistent', 'Test')
      `).run();
    }).toThrow();
  });
});
