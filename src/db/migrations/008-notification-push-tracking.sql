-- Track push notification delivery for retry on transient failures

ALTER TABLE notifications ADD COLUMN push_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN push_sent INTEGER NOT NULL DEFAULT 0;
