---
# mob-crm-2d6w
title: Inline tag autocomplete on contact profile
status: completed
type: feature
priority: normal
created_at: 2026-08-03T00:03:42Z
updated_at: 2026-08-03T00:07:05Z
---

On the contact profile, adding tags should be an inline autocomplete in view mode (deleting inline already works). Suggest existing tags as the user types; selecting/entering an existing tag assigns it immediately (no modal). Only when the typed name is a brand-new (unseen) tag do we open a modal to pick its color and create it.

## Background
- Tags section lives in `web/src/pages/contacts/ContactProfileView.tsx` (~lines 172-189): renders tag-chips with an inline remove (×) button already, and an `onAdd` that currently opens `TagEditor` (always a modal asking name + color).
- `TagEditor` is in `web/src/pages/contacts/SubEntityEditors.tsx` (~line 313): Modal with name Input + color Input, POSTs to /contacts/:id/tags.
- Backend already supports everything needed:
  - `GET /web/api/tags` → lists ALL of the user's tags with colors (`src/server/web-api/tags.ts`) — use for autocomplete suggestions.
  - `POST /web/api/contacts/:contactId/tags` { name, color? } → `TagService.tagContact` creates the tag by name if it doesn't exist, else reuses it, then assigns (`src/server/web-api/contact-tags.ts`, `src/services/tags-groups.ts`).
  - `DELETE /web/api/contacts/:contactId/tags/:tagId` → untag.
- `Tag` type + tag chip styles already exist (`web/src/api/types.ts`, `web/src/ui/styles.css` .tag-chip*).

## Requirements
1. In the profile Tags section (view mode), add an inline autocomplete/combobox input to add a tag. As the user types, suggest matching existing user tags (from GET /tags), excluding ones already on the contact. Keyboard-navigable (arrow keys + Enter), click-to-select.
2. Selecting an existing tag (or typing an exact existing name) → immediately POST /contacts/:id/tags with that name (color omitted) and refresh — NO modal.
3. If the typed name matches NO existing tag → open a modal (reuse/adapt TagEditor) pre-filled with the typed name to choose a color, then create+assign the brand-new tag.
4. Keep inline delete (×) working. Optimistic-ish UX with toasts consistent with the rest of the page.
5. Works in forgetful/demo mode.

## Checklist
- [x] Fetch user tags for autocomplete (client + types if needed)
- [x] Inline autocomplete combobox in the Tags section (keyboard + mouse)
- [x] Existing tag → assign immediately, no modal
- [x] New/unseen tag → color-picker modal (adapt TagEditor, prefill name)
- [x] Preserve inline delete
- [x] Styles for the autocomplete dropdown
- [x] e2e spec (write; orchestrator runs playwright)
- [x] typecheck + lint + vitest green
