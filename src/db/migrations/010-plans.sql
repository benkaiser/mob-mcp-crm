-- Plan & quota model.
-- The `plan` column drives entitlements ONLY when the server runs in hosted mode.
-- In self-hosted / open-source mode the PlanService treats everyone as unlimited
-- regardless of this value, so existing rows need no special backfill.

ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'unlimited';
