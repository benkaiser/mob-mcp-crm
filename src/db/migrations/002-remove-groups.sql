-- Remove groups feature: drop contact_groups junction table first, then groups_table
DROP TABLE IF EXISTS contact_groups;
DROP TABLE IF EXISTS groups_table;
