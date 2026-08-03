---
# mob-crm-lkg4
title: Favorite/unfavorite via star button on contact profile
status: completed
type: feature
priority: normal
created_at: 2026-08-03T00:00:04Z
updated_at: 2026-08-03T00:03:44Z
---

Users should be able to toggle a contact's favorite status directly from the profile header with a star button, without entering edit mode.

## Background
- `is_favorite` already exists: DB column (contacts.is_favorite INTEGER), service (`src/services/contacts.ts` ContactService update maps is_favorite), and the web-api PATCH /contacts/:id already accepts it.
- `web/src/pages/contacts/ContactProfileView.tsx` currently only shows a static badge: `{p.is_favorite && <Badge tone=warning>★ Favorite</Badge>}` near the name (~line 114). The action row (Edit/Delete) is ~lines 100-103.
- `ContactProfile` type already includes `is_favorite`.

## Requirements
1. Add an interactive star toggle button in the profile header (near the name / action row) that toggles favorite on/off via PATCH /contacts/:id { is_favorite } — no edit mode.
2. Optimistic UI update with a success/error toast; revert on failure. Filled star (★) when favorited, outline (☆) when not; accessible label/title.
3. Keep it working in forgetful/demo mode consistent with other profile mutations.

## Checklist
- [x] Star toggle button in ContactProfileView header
- [x] PATCH wiring + optimistic update + toast + revert on error
- [x] Styling for the star button (styles.css)
- [x] e2e spec (write; do not run playwright — orchestrator runs e2e)
- [x] typecheck + lint + vitest green