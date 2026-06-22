---
# mob-crm-d6t5
title: 'Settings: profile/timezone/password + plan & usage display'
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:14Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-2py4
---

Account settings surface.

## Design
- Internal API: GET/PATCH /web/api/settings (profile name, timezone via UserSettingsService; birthday_reminder_time), POST /web/api/settings/password (change password via accountService, verify current).
- Plan & usage display: current plan, contact usage (X/cap), upgrade CTA (hosted only). "Connect AI assistant" entry point (wires to unified auth bridge from epic 1).
- UI: settings page with sections (profile, preferences/timezone, security/password, plan & usage, AI assistant connection, API tokens link, push notifications link).

## Checklist
- [x] Settings GET/PATCH + password change API
- [x] Plan & usage display (hosted-aware)
- [x] Connect-AI-assistant entry point
- [x] Settings UI with all sections + links
- [x] Tests: settings update + password change happy+error; render
