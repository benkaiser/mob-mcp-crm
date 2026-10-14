-- Per-user Matrix notification target.
--
-- Stores the homeserver, access token and room id used to post reminder and
-- birthday notifications to a Matrix room (alongside web push). All nullable:
-- NULL / empty means Matrix delivery is simply disabled for that user.
--
-- user_settings has no CHECK constraint on these columns, so a plain additive
-- ALTER TABLE ADD COLUMN is sufficient (no table rebuild). The access token is
-- stored as-is, like the existing OAuth access tokens.

ALTER TABLE user_settings ADD COLUMN matrix_homeserver TEXT;
ALTER TABLE user_settings ADD COLUMN matrix_access_token TEXT;
ALTER TABLE user_settings ADD COLUMN matrix_room_id TEXT;
