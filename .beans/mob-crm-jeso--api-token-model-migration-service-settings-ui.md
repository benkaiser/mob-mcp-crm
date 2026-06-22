---
# mob-crm-jeso
title: API token model (migration, service, settings UI)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:58Z
updated_at: 2026-05-29T14:44:59Z
parent: mob-crm-b6eq
---

Personal access tokens for the public API.

## Design
- Migration `api_tokens` table: id, user_id, name, token_hash (bcrypt/sha256), prefix (shown for identification), scopes, created_at, last_used_at, revoked_at.
- ApiTokenService: create (returns plaintext ONCE), list (masked), revoke, verify(plaintext)->user+scopes (update last_used_at).
- Settings UI: list tokens (name, prefix, last used), create (name + scopes -> show secret once with copy), revoke (confirm).
- Tokens are an advanced/paid feature in hosted mode (gate the creation UI + endpoint accordingly); always available self-hosted.

## Checklist
- [x] Migration api_tokens
- [x] ApiTokenService (create/list/revoke/verify, hashed at rest)
- [x] Settings UI (list/create-show-once/revoke)
- [x] Plan-gate token creation in hosted mode
- [x] Tests: create/verify/revoke; hashing; last_used update; gating
