import Database from 'better-sqlite3';
import { runMigrations } from './migrator.js';
import { seedForgetfulData } from './seed-data.js';

const TEMPLATE_USER_ID = '__TEMPLATE__';

/**
 * Manages a serialized "template" database for forgetful mode.
 *
 * At construction time it:
 *   1. Creates an in-memory DB and runs migrations
 *   2. Inserts a template user (id = '__TEMPLATE__')
 *   3. Seeds all Bluey-themed data
 *   4. Serializes the DB to a Buffer snapshot
 *
 * On each clone() call it:
 *   1. Restores the Buffer into a new in-memory DB
 *   2. Re-enables pragmas
 *   3. Remaps the template userId to the real session userId
 */
export class ForgetfulTemplate {
  private templateBuffer: Buffer;

  constructor() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');

    runMigrations(db);

    // Create the template user
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(TEMPLATE_USER_ID, 'Bluey Heeler', 'bluey@heeler.family', 'none');

    // Seed all Bluey data
    seedForgetfulData(db, TEMPLATE_USER_ID);

    // Serialize to buffer
    this.templateBuffer = db.serialize();
    db.close();
  }

  /**
   * Clone the template database for a new forgetful user session.
   * Remaps the placeholder userId to the real userId.
   */
  clone(newUserId: string): Database.Database {
    const db = new Database(this.templateBuffer);

    // Re-enable pragmas (serialized DB may lose pragma state).
    // Note: WAL doesn't work for buffer-restored in-memory DBs,
    // so use 'memory' journal mode instead.
    db.pragma('journal_mode = memory');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');

    // Remap the template userId to the new session userId.
    // Must disable foreign keys temporarily to avoid constraint issues during update.
    db.pragma('foreign_keys = OFF');

    db.prepare('UPDATE users SET id = ?, email = ? WHERE id = ?')
      .run(newUserId, `bluey-${newUserId}@heeler.family`, TEMPLATE_USER_ID);

    // Update all tables with user_id FK
    const tablesWithUserId = [
      'contacts',
      'tags',
      'activities',
      'activity_types',
      'notifications',
      'tasks',
      'authorization_log',
    ];

    for (const table of tablesWithUserId) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`)
        .run(newUserId, TEMPLATE_USER_ID);
    }

    db.pragma('foreign_keys = ON');

    return db;
  }
}
