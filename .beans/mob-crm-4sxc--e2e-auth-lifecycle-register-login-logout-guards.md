---
# mob-crm-4sxc
title: 'E2E: Auth lifecycle (register, login, logout, guards)'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:06:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/auth.spec.ts. Owns: src/server/views/web-login.ejs, register.ejs (may add testids), tests/e2e/auth.spec.ts.

Cover the full auth lifecycle through the real server + SPA:
- Register a new account via /auth/register form → redirected to /app/ dashboard, session cookie set.
- Register with an email that already exists → 409 error shown on the register page.
- Log in via /web/login with correct creds → /app/. Wrong password → error message, stays on login.
- Visiting /app/ unauthenticated → AuthGuard redirects to /web/login (preserving redirect).
- Log out (sidebar logout link → /web/logout) → session cleared, /app/ now redirects to login.
- /web/dashboard and /web/import legacy paths 301-redirect into the SPA.

## Checklist
- [x] Register success → dashboard
- [x] Duplicate email → 409 error
- [x] Login success / wrong password
- [x] Unauthed /app → login redirect
- [x] Logout clears session
- [x] Legacy redirects (/web/dashboard, /web/import)
