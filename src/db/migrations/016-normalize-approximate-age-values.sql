-- Migration 016: Normalize approximate age values stored in the birth-year field
--
-- birthday_year_approximate is a birth-year column, but some capture paths could
-- pass an approximate age (for example 10) into it. Those rows then rendered as
-- a 4-digit age (current year - 10 = 2016). Convert clearly age-like values to
-- birth years so approximate ages continue to increment in future calendar years.

UPDATE contacts
SET birthday_year_approximate = CAST(strftime('%Y', 'now') AS INTEGER) - birthday_year_approximate
WHERE birthday_mode = 'approximate_age'
  AND birthday_year_approximate BETWEEN 0 AND 150;
