---
# mob-crm-4n0z
title: Build migration runner and initial schema
status: completed
type: task
priority: high
created_at: 2026-02-09T00:07:03Z
updated_at: 2026-02-09T00:14:17Z
parent: mob-crm-zbag
---

Create a migration system and the initial database schema.

## Checklist
- [x] Create src/db/migrator.ts — reads SQL files from src/db/migrations/ in order
- [x] Track applied migrations in a migrations table
- [x] Create 001-initial-schema.sql with tables for:
  - users (id, name, email, password_hash, created_at, updated_at)
  - authorization_log (id, user_id, client_id, ip_address, user_agent, authorized_at, last_used_at)
  - contacts (id, user_id, first_name, last_name, nickname, maiden_name, gender, pronouns, avatar_url, birthday_date, birthday_month, birthday_day, birthday_year_approximate, birthday_mode, status, deceased_date, is_favorite, met_at_date, met_at_location, met_through_contact_id, met_description, job_title, company, industry, work_notes, created_at, updated_at, deleted_at)
  - contact_methods (id, contact_id, type, value, label, is_primary, created_at, updated_at)
  - addresses (id, contact_id, label, street_line_1, street_line_2, city, state_province, postal_code, country, is_primary, created_at, updated_at)
  - food_preferences (id, contact_id, dietary_restrictions, allergies, favorite_foods, disliked_foods, notes)
  - custom_fields (id, contact_id, field_name, field_value, field_group, created_at, updated_at)
- [x] Run migrations automatically on server start
- [x] Write tests for the migration runner