-- OAuth 2.0 Dynamic Client Registration (RFC 7591)
-- MCP clients (Claude, Codex, ...) register themselves before starting the
-- authorization code + PKCE flow. Registrations are stored here so redirect
-- URIs can be validated on every subsequent authorization request.

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT,
  client_name TEXT,
  redirect_uris TEXT NOT NULL,
  grant_types TEXT NOT NULL,
  response_types TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL,
  scope TEXT,
  client_uri TEXT,
  logo_uri TEXT,
  software_id TEXT,
  software_version TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_created ON oauth_clients(created_at);
