---
# mob-crm-mqmg
title: Forgetful Mode
status: completed
type: epic
priority: normal
created_at: 2026-02-09T00:06:28Z
updated_at: 2026-02-09T00:52:41Z
parent: mob-crm-05bd
---

Implement ephemeral/forgetful operating mode.

## Scope
- --forgetful CLI flag to enable forgetful mode
- OAuth flow runs but no credentials required (auto-approve, session-based tokens)
- Each session gets an isolated in-memory or temp-file SQLite database
- Session ID used as user identifier (no account creation)
- Automatic data destruction on session disconnect
- 2-hour maximum session lifetime with automatic cleanup timer
- Full feature parity with persistent mode
- Integration tests for session lifecycle and data destruction