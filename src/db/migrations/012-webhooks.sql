-- Migration 012: Outbound webhooks.
--
-- Adds two tables backing the webhooks feature (a paid/advanced entitlement in
-- hosted mode, fully available self-hosted):
--   * webhooks            — subscriber endpoints owned by a user.
--   * webhook_deliveries  — per-event delivery attempts with retry bookkeeping.
--
-- IDs follow the short 8-char base-36/hex default convention (see migration 003).

-- ─── webhooks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL, -- comma-separated event names, or '*' for all events
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);

-- ─── webhook_deliveries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL, -- pending | success | failed
  response_status INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_status
  ON webhook_deliveries(webhook_id, status);
