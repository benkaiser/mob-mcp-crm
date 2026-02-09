import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export interface DatabaseConfig {
  dataDir: string;
  inMemory?: boolean;
}

/**
 * Creates and configures a SQLite database connection.
 * Supports both file-based (persistent) and in-memory (forgetful/testing) modes.
 */
export function createDatabase(config: DatabaseConfig): Database.Database {
  let db: Database.Database;

  if (config.inMemory || config.dataDir === ':memory:') {
    db = new Database(':memory:');
  } else {
    // Ensure data directory exists
    fs.mkdirSync(config.dataDir, { recursive: true });
    const dbPath = path.join(config.dataDir, 'mob.db');
    db = new Database(dbPath);
  }

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Performance optimizations
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache

  return db;
}

/**
 * Closes a database connection safely.
 */
export function closeDatabase(db: Database.Database): void {
  db.close();
}
