import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Runs all pending database migrations in order.
 * Migrations are SQL files in src/db/migrations/ named with a numeric prefix (e.g., 001-initial.sql).
 * Applied migrations are tracked in a `migrations` table.
 */
export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Get already applied migrations
  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all()
      .map((row: any) => row.name)
  );

  // Read migration files and sort by name
  let migrationFiles: string[];
  try {
    migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    // No migrations directory yet — this is fine during early development
    migrationFiles = [];
  }

  // Apply pending migrations in a transaction
  const applyMigration = db.transaction((name: string, sql: string) => {
    db.exec(sql);
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
  });

  for (const file of migrationFiles) {
    if (!applied.has(file)) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      applyMigration(file, sql);
      console.log(`  ✓ Migration applied: ${file}`);
    }
  }
}
