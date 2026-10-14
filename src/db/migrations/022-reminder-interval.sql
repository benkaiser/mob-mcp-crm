-- Custom recurrence interval + daily frequency for reminders.
--
-- `interval` is a multiplier on the `frequency` unit: e.g. frequency='weekly'
-- with interval=6 means "every 6 weeks". `one_time` reminders ignore it.
-- We also widen the frequency CHECK to allow 'daily'.
--
-- SQLite can't alter a CHECK constraint or add a column to an existing CHECK in
-- place, so we recreate the table and copy rows. `reminders` is not referenced
-- by any other table and has no triggers, so the rebuild is safe. Existing rows
-- get interval = 1, preserving current behavior.

CREATE TABLE reminders_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('one_time', 'daily', 'weekly', 'monthly', 'yearly')),
  interval INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'snoozed', 'completed', 'dismissed')),
  is_auto_generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- interval is omitted from the column list so existing rows take the DEFAULT 1.
INSERT INTO reminders_new
  (id, contact_id, title, description, reminder_date, frequency, status, is_auto_generated, created_at, updated_at, deleted_at)
SELECT
  id, contact_id, title, description, reminder_date, frequency, status, is_auto_generated, created_at, updated_at, deleted_at
FROM reminders;

DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;

CREATE INDEX IF NOT EXISTS idx_reminders_contact ON reminders(contact_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
