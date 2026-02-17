-- Migration 004: Add is_me column to contacts
--
-- Adds an `is_me` flag to the contacts table so the user can exist as a
-- self-contact. This self-contact participates in relationships just like
-- any other contact but is protected from deletion.

ALTER TABLE contacts ADD COLUMN is_me INTEGER NOT NULL DEFAULT 0;
