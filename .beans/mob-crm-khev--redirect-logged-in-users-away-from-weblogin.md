---
# mob-crm-khev
title: Redirect logged-in users away from /web/login
status: completed
type: bug
priority: normal
created_at: 2026-06-22T01:19:30Z
updated_at: 2026-06-22T01:26:17Z
---

GET /web/login renders the login form even when the user already has a valid web session. Check for an existing session and redirect to the safe redirect target (default /app/) instead.