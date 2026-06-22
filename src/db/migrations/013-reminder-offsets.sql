-- Advance-notice offsets for custom reminders (separate from birthday offsets).
-- Controls how many days before a reminder's due date a push notification fires.

ALTER TABLE user_settings ADD COLUMN reminder_offsets TEXT NOT NULL DEFAULT '[0,7,30]';
