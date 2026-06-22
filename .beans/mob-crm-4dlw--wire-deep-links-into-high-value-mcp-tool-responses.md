---
# mob-crm-4dlw
title: Wire deep-links into high-value MCP tool responses
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:51:56Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-hq5x
---

Surface "view on web" links after key MCP actions via URL elicitation / tool result.

## Design
- After successful contact_create, activity create, reminder_create, gift create, debt create (and updates where useful), include a deep-link to the resource on the web in the tool result and/or via URL elicitation (reuse existing elicitation fallback machinery).
- Keep it non-intrusive: include the URL in the structured result so the assistant can offer "View Sarah on the web".
- Respect forgetful mode (omit or use bridge per the route-map bean's decision).

## Checklist
- [x] Add deep-link to results of contact/activity/reminder/gift/debt create (+ select updates)
- [x] Use URL elicitation where appropriate with graceful fallback
- [x] Forgetful-mode respected
- [x] Tests: each wired tool returns a valid deep-link; fallback path; forgetful path
