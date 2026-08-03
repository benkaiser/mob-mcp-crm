-- User-scoped custom relationship types with inverse mapping.

CREATE TABLE IF NOT EXISTS custom_relationship_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  label TEXT,
  inverse_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, value)
);

CREATE INDEX IF NOT EXISTS idx_custom_relationship_types_user ON custom_relationship_types(user_id);
