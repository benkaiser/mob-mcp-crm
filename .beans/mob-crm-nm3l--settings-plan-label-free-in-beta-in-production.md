---
# mob-crm-nm3l
title: 'Settings plan label: ''free in beta'' in production'
status: completed
type: task
priority: normal
created_at: 2026-08-03T00:13:47Z
updated_at: 2026-08-03T00:39:27Z
---

On the Settings 'Plan & usage' section, production currently shows 'Plan unlimited · self-hosted' which is wrong for the hosted beta. When the server env var ENV=production, the suffix should read ' · free in beta' instead. Add a beta flag to the web-api GET /web/api/me payload (src/server/web-api/index.ts ~line 117) derived from process.env.ENV === 'production'; expose it on the Me type (web/src/api/types.ts); and update web/src/pages/Settings.tsx (~line 284: currently me.hosted ? ' · hosted' : ' · self-hosted') to show ' · free in beta' when me.beta is true. Note: Settings.tsx is being edited by another agent (rel-form) — apply after it lands. Add/adjust a test for the /me beta flag.