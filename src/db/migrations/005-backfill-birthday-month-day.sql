-- Migration 005: Backfill birthday_month and birthday_day from birthday_date
--
-- Contacts created with birthday_mode='full_date' and only birthday_date set
-- (no explicit birthday_month/birthday_day) were invisible to getUpcomingBirthdays
-- because the query requires birthday_month IS NOT NULL AND birthday_day IS NOT NULL.
-- This migration populates those columns from the stored birthday_date string (YYYY-MM-DD).

UPDATE contacts
SET
  birthday_month = CAST(SUBSTR(birthday_date, 6, 2) AS INTEGER),
  birthday_day   = CAST(SUBSTR(birthday_date, 9, 2) AS INTEGER)
WHERE birthday_mode = 'full_date'
  AND birthday_date IS NOT NULL
  AND (birthday_month IS NULL OR birthday_day IS NULL);
