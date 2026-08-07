-- Add a dedicated middle_name field to contacts, matching Monica CRM's
-- underlying data model (which stores middle_name separately from
-- first_name/last_name even though it isn't exposed on all forms).

ALTER TABLE contacts ADD COLUMN middle_name TEXT;
