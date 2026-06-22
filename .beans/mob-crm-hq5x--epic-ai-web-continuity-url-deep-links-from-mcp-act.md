---
# mob-crm-hq5x
title: 'Epic: AI <-> Web continuity — URL deep-links from MCP actions'
status: completed
type: epic
priority: normal
created_at: 2026-05-29T13:46:35Z
updated_at: 2026-05-29T14:53:02Z
parent: mob-crm-ehb6
---

Lightweight version of two-way continuity (NOT AI-in-the-web). When an action is performed via MCP, surface a link to the corresponding web resource so the user can jump from the AI conversation to the web UI.

## Approach
Use MCP URL elicitation (the existing elicitation/auto-login machinery) to return a deep-link to the relevant SPA route after an action. E.g. after creating a contact via MCP, the tool result/elicitation includes a "View Sarah on the web" link to `/app/contacts/:id` (with an auto-login token so the user lands authenticated).

## Goals
- Deterministic SPA route map for every primary entity (contact, activity, reminder, gift, debt, task, life event, note list, timeline).
- A helper in the MCP layer that builds an authenticated deep-link (base_url already stored in server_config; reuse accountService auto-login token issuance).
- Wire deep-links into the most valuable MCP actions first: contact_create, activity create, reminder_create, gift create, debt create — return a "view on web" URL.
- Respect forgetful mode (no persistent web account -> skip or use the forgetful web session bridge if feasible; otherwise omit link).

## Children
- SPA route map + authenticated deep-link builder (reuse auto-login token)
- Wire deep-links into high-value MCP create/update tool responses
- Tests: link generation, auto-login token round-trip, forgetful-mode behavior

Blocked by Epics 1, 2, 3 (needs SPA routes + sessions + auto-login).
