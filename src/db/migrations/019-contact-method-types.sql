-- Custom contact method types and configurable deep-link templates.

CREATE TABLE IF NOT EXISTS contact_method_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  link_template TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_contact_method_types_user ON contact_method_types(user_id);

-- SQLite cannot drop a CHECK constraint in place, so rebuild contact_methods
-- without the fixed type enum while preserving all rows and foreign keys.
ALTER TABLE contact_methods RENAME TO contact_methods_old;

CREATE TABLE contact_methods (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO contact_methods (id, contact_id, type, value, label, is_primary, created_at, updated_at)
SELECT id, contact_id, type, value, label, is_primary, created_at, updated_at
FROM contact_methods_old;

DROP TABLE contact_methods_old;

CREATE INDEX IF NOT EXISTS idx_contact_methods_contact ON contact_methods(contact_id);
