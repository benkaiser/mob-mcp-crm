-- Migration 003: Shorter ID defaults
--
-- Updates the DEFAULT expression on all tables that auto-generate IDs.
-- The application code now generates 8-character base-36 IDs via generateId(),
-- but we also update the SQLite defaults so that any raw SQL INSERT without an
-- explicit id will produce a short 8-character hex string instead of the old
-- 32-character one.
--
-- SQLite doesn't support ALTER COLUMN DEFAULT, so we update the schema by
-- recreating each table. Existing data (including old 32-char IDs) is preserved.
-- TEXT columns accept any string length so old and new IDs coexist safely.

-- ─── users ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO users_new SELECT * FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- ─── authorization_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authorization_log_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  authorized_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO authorization_log_new SELECT * FROM authorization_log;
DROP TABLE authorization_log;
ALTER TABLE authorization_log_new RENAME TO authorization_log;

-- ─── contacts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  nickname TEXT,
  maiden_name TEXT,
  gender TEXT,
  pronouns TEXT,
  avatar_url TEXT,
  birthday_mode TEXT CHECK (birthday_mode IN ('full_date', 'month_day', 'approximate_age')),
  birthday_date TEXT,
  birthday_month INTEGER,
  birthday_day INTEGER,
  birthday_year_approximate INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deceased')),
  deceased_date TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  met_at_date TEXT,
  met_at_location TEXT,
  met_through_contact_id TEXT REFERENCES contacts_new(id) ON DELETE SET NULL,
  met_description TEXT,
  job_title TEXT,
  company TEXT,
  industry TEXT,
  work_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO contacts_new SELECT * FROM contacts;
DROP TABLE contacts;
ALTER TABLE contacts_new RENAME TO contacts;

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(user_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(user_id, company);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON contacts(user_id, deleted_at);

-- ─── contact_methods ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_methods_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email', 'phone', 'whatsapp', 'telegram', 'signal', 'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other')),
  value TEXT NOT NULL,
  label TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO contact_methods_new SELECT * FROM contact_methods;
DROP TABLE contact_methods;
ALTER TABLE contact_methods_new RENAME TO contact_methods;

CREATE INDEX IF NOT EXISTS idx_contact_methods_contact ON contact_methods(contact_id);

-- ─── addresses ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addresses_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label TEXT,
  street_line_1 TEXT,
  street_line_2 TEXT,
  city TEXT,
  state_province TEXT,
  postal_code TEXT,
  country TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO addresses_new SELECT * FROM addresses;
DROP TABLE addresses;
ALTER TABLE addresses_new RENAME TO addresses;

CREATE INDEX IF NOT EXISTS idx_addresses_contact ON addresses(contact_id);

-- ─── food_preferences ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS food_preferences_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  dietary_restrictions TEXT,
  allergies TEXT,
  favorite_foods TEXT,
  disliked_foods TEXT,
  notes TEXT
);
INSERT OR IGNORE INTO food_preferences_new SELECT * FROM food_preferences;
DROP TABLE food_preferences;
ALTER TABLE food_preferences_new RENAME TO food_preferences;

-- ─── custom_fields ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_fields_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  field_group TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO custom_fields_new SELECT * FROM custom_fields;
DROP TABLE custom_fields;
ALTER TABLE custom_fields_new RENAME TO custom_fields;

CREATE INDEX IF NOT EXISTS idx_custom_fields_contact ON custom_fields(contact_id);

-- ─── relationships ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  related_contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contact_id, related_contact_id, relationship_type)
);
INSERT OR IGNORE INTO relationships_new SELECT * FROM relationships;
DROP TABLE relationships;
ALTER TABLE relationships_new RENAME TO relationships;

CREATE INDEX IF NOT EXISTS idx_relationships_contact ON relationships(contact_id);
CREATE INDEX IF NOT EXISTS idx_relationships_related ON relationships(related_contact_id);

-- ─── notes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO notes_new SELECT * FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);

-- ─── tags ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);
INSERT OR IGNORE INTO tags_new SELECT * FROM tags;
DROP TABLE tags;
ALTER TABLE tags_new RENAME TO tags;

-- ─── contact_tags (no id column — skip) ─────────────────────────
-- contact_tags has a composite PK (contact_id, tag_id) with no generated id.
-- Recreate to restore FK references after tags table was recreated.
CREATE TABLE IF NOT EXISTS contact_tags_new (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
INSERT OR IGNORE INTO contact_tags_new SELECT * FROM contact_tags;
DROP TABLE contact_tags;
ALTER TABLE contact_tags_new RENAME TO contact_tags;

-- ─── activity_types ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_types_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO activity_types_new SELECT * FROM activity_types;
DROP TABLE activity_types;
ALTER TABLE activity_types_new RENAME TO activity_types;

-- ─── activities ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other')),
  title TEXT,
  description TEXT,
  occurred_at TEXT NOT NULL,
  duration_minutes INTEGER,
  location TEXT,
  activity_type_id TEXT REFERENCES activity_types(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO activities_new SELECT * FROM activities;
DROP TABLE activities;
ALTER TABLE activities_new RENAME TO activities;

CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_occurred ON activities(user_id, occurred_at);

-- ─── activity_participants (no id column — skip) ────────────────
-- Composite PK, no generated id. Recreate for FK references.
CREATE TABLE IF NOT EXISTS activity_participants_new (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, contact_id)
);
INSERT OR IGNORE INTO activity_participants_new SELECT * FROM activity_participants;
DROP TABLE activity_participants;
ALTER TABLE activity_participants_new RENAME TO activity_participants;

-- ─── life_events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS life_events_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO life_events_new SELECT * FROM life_events;
DROP TABLE life_events;
ALTER TABLE life_events_new RENAME TO life_events;

CREATE INDEX IF NOT EXISTS idx_life_events_contact ON life_events(contact_id);

-- ─── life_event_contacts (no id column — skip) ──────────────────
-- Composite PK, no generated id. Recreate for FK references.
CREATE TABLE IF NOT EXISTS life_event_contacts_new (
  life_event_id TEXT NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (life_event_id, contact_id)
);
INSERT OR IGNORE INTO life_event_contacts_new SELECT * FROM life_event_contacts;
DROP TABLE life_event_contacts;
ALTER TABLE life_event_contacts_new RENAME TO life_event_contacts;

-- ─── reminders ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminders_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reminder_date TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('one_time', 'weekly', 'monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'snoozed', 'completed', 'dismissed')),
  is_auto_generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO reminders_new SELECT * FROM reminders;
DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;

CREATE INDEX IF NOT EXISTS idx_reminders_contact ON reminders(contact_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);

-- ─── notifications ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('birthday', 'reminder', 'follow_up', 'custom')),
  title TEXT NOT NULL,
  body TEXT,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  source_type TEXT,
  source_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
INSERT OR IGNORE INTO notifications_new SELECT * FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- ─── gifts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gifts_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  estimated_cost REAL,
  currency TEXT DEFAULT 'USD',
  occasion TEXT,
  status TEXT NOT NULL CHECK (status IN ('idea', 'planned', 'purchased', 'given', 'received')),
  direction TEXT NOT NULL CHECK (direction IN ('giving', 'receiving')),
  date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO gifts_new SELECT * FROM gifts;
DROP TABLE gifts;
ALTER TABLE gifts_new RENAME TO gifts;

CREATE INDEX IF NOT EXISTS idx_gifts_contact ON gifts(contact_id);

-- ─── debts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debts_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  direction TEXT NOT NULL CHECK (direction IN ('i_owe_them', 'they_owe_me')),
  reason TEXT,
  incurred_at TEXT,
  settled_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO debts_new SELECT * FROM debts;
DROP TABLE debts;
ALTER TABLE debts_new RENAME TO debts;

CREATE INDEX IF NOT EXISTS idx_debts_contact ON debts(contact_id);

-- ─── tasks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks_new (
  id TEXT PRIMARY KEY DEFAULT (substr(lower(hex(randomblob(4))),1,8)),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
INSERT OR IGNORE INTO tasks_new SELECT * FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
