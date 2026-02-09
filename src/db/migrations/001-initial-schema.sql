-- Initial schema for Mob CRM
-- Creates all core tables for contacts and sub-entities

-- Users table (for persistent mode authentication)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Authorization log (tracks all OAuth sessions)
CREATE TABLE IF NOT EXISTS authorization_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  authorized_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contacts (core entity)
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identity
  first_name TEXT NOT NULL,
  last_name TEXT,
  nickname TEXT,
  maiden_name TEXT,
  gender TEXT,
  pronouns TEXT,
  avatar_url TEXT,

  -- Birthday (supports 3 modes: full_date, month_day, approximate_age)
  birthday_mode TEXT CHECK (birthday_mode IN ('full_date', 'month_day', 'approximate_age')),
  birthday_date TEXT,       -- Full ISO date (YYYY-MM-DD) for full_date mode
  birthday_month INTEGER,   -- Month (1-12) for month_day mode
  birthday_day INTEGER,     -- Day (1-31) for month_day mode
  birthday_year_approximate INTEGER, -- Estimated birth year for approximate_age mode

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deceased')),
  deceased_date TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,

  -- How we met
  met_at_date TEXT,
  met_at_location TEXT,
  met_through_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  met_description TEXT,

  -- Work information
  job_title TEXT,
  company TEXT,
  industry TEXT,
  work_notes TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(user_id, last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(user_id, company);
CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON contacts(user_id, deleted_at);

-- Contact methods (email, phone, social, etc.)
CREATE TABLE IF NOT EXISTS contact_methods (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email', 'phone', 'whatsapp', 'telegram', 'signal', 'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other')),
  value TEXT NOT NULL,
  label TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contact_methods_contact ON contact_methods(contact_id);

-- Addresses
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_addresses_contact ON addresses(contact_id);

-- Food preferences
CREATE TABLE IF NOT EXISTS food_preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  dietary_restrictions TEXT, -- JSON array
  allergies TEXT,            -- JSON array
  favorite_foods TEXT,       -- JSON array
  disliked_foods TEXT,       -- JSON array
  notes TEXT
);

-- Custom fields
CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  field_group TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_contact ON custom_fields(contact_id);

-- Relationships between contacts
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  related_contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(contact_id, related_contact_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_contact ON relationships(contact_id);
CREATE INDEX IF NOT EXISTS idx_relationships_related ON relationships(related_contact_id);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(user_id, name)
);

-- Contact-tag junction
CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- Groups
CREATE TABLE IF NOT EXISTS groups_table (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contact-group junction
CREATE TABLE IF NOT EXISTS contact_groups (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups_table(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, group_id)
);

-- Activities / Interactions
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_occurred ON activities(user_id, occurred_at);

-- Activity participants (many-to-many between activities and contacts)
CREATE TABLE IF NOT EXISTS activity_participants (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, contact_id)
);

-- Custom activity types
CREATE TABLE IF NOT EXISTS activity_types (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Life events
CREATE TABLE IF NOT EXISTS life_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  occurred_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_life_events_contact ON life_events(contact_id);

-- Life event related contacts
CREATE TABLE IF NOT EXISTS life_event_contacts (
  life_event_id TEXT NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (life_event_id, contact_id)
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_reminders_contact ON reminders(contact_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- Gifts
CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_gifts_contact ON gifts(contact_id);

-- Debts
CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_debts_contact ON debts(contact_id);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
