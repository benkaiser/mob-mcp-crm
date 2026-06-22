-- API tokens for the public REST API (/api/v1).
-- Tokens are issued per-user. Only a sha256 hash of the plaintext token is
-- stored; the plaintext is shown exactly once at creation time. A short
-- `prefix` (first chars after the `mob_` scheme) is stored for identification
-- in listings. `scopes` is a comma-separated list (e.g. 'read,write').

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read,write',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
