---
# mob-crm-rjbn
title: Tag management in Settings + drop tag color
status: completed
type: feature
priority: normal
created_at: 2026-08-03T00:43:29Z
updated_at: 2026-08-03T00:48:17Z
---

Two changes to tag handling.

## Part A: Tag management UI in Settings
Add a "Tags" management section to the Settings page (`web/src/pages/Settings.tsx`) — follow the existing section patterns there (e.g. RelationshipTypesSection, ProfileSection). It should let the user:
- List all their tags (GET /web/api/tags).
- Create a tag by name (POST /web/api/tags).
- Rename a tag (PATCH /web/api/tags/:id).
- Delete a tag (DELETE /web/api/tags/:id), with a confirm.
The web-api tags router already supports GET/POST/PATCH/DELETE (`src/server/web-api/tags.ts`). Add a small typed client in `web/src/api/` if one doesn't exist for tags, or reuse apiGet/apiPost/etc. Persistent-mode feature; keep consistent with how other Settings sections behave in forgetful mode.

## Part B: Drop tag "color" entirely (not visualized)
Color isn't visualized meaningfully, so remove it from the DB, API, and inputs:
- DB migration (next number, currently 016 is latest → add 017): drop the `color` column from `tags` (SQLite 3.35+ supports `ALTER TABLE tags DROP COLUMN color`; better-sqlite3 bundles a recent SQLite. If DROP COLUMN fails, do a table-rebuild migration). Also update `src/db/seed-data.ts` line ~19 which INSERTs tags with a color (remove the color column/value there).
- Service `src/services/tags-groups.ts`: remove `color` from the `Tag` type, and drop the `color?` params/handling from `create`, `update`, `tagContact`, `batchTagContacts`, and the INSERT/UPDATE SQL.
- Web-api: remove `color` from the zod schemas and calls in `src/server/web-api/tags.ts` (createTagSchema, updateTagSchema, the create call) and `src/server/web-api/contact-tags.ts` (tagContactSchema, the tagContact call).
- Web: remove `color` from `web/src/api/types.ts` (`Tag` ~line 185) and any tags client. Remove the color swatch in `web/src/components/TagAutocomplete.tsx` (~line 193 `tag-autocomplete__swatch` using `tag.color`) and any related CSS.
- CRUCIAL simplification: the tag autocomplete currently opens a "Choose tag color" modal for brand-new tags (`SubEntityEditors.tsx` TagEditor `lockName` mode ~lines 313-345, and the flow in TagAutocomplete/ContactProfileView). With color gone, a brand-new tag should just be CREATED BY NAME directly (POST /contacts/:id/tags with { name }) — NO modal. Remove the color modal / color input entirely and simplify the new-tag path to a direct create.
- Check `src/services/monica-import.ts` / `monica-parser.ts` / `src/services/data-export.ts` for any tag color references and remove/adjust.

## Testing
- Update integration tests that assert tag `color` (search tests/ for `color` near tags, e.g. web-api-tags test, tags service test).
- Add integration tests for the Settings tag CRUD if not already covered by the tags router tests.
- Update e2e: the tag-add flow no longer shows a color modal (search tests/e2e for `tag-color` / tag). Add a Settings tag-management e2e. WRITE/UPDATE specs but DO NOT run Playwright (orchestrator runs it later).
- Run and ensure green: `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test` (vitest).

## Checklist
- [x] Migration 017 drops tags.color; seed-data updated
- [x] TagService: remove color from type/create/update/tagContact/batchTagContacts + SQL
- [x] Web-api tags.ts + contact-tags.ts: remove color from schemas/calls
- [x] Web types + TagAutocomplete swatch removed; new-tag path creates by name (no color modal)
- [x] TagEditor color input/modal removed
- [x] Settings: Tags management section (list/create/rename/delete)
- [x] monica-import/export tag color references removed
- [x] Tests updated (service + web-api + e2e)
- [x] typecheck + lint + vitest green
