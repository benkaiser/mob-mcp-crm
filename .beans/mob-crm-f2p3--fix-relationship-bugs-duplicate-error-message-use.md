---
# mob-crm-f2p3
title: 'Fix relationship bugs: duplicate error message + use ContactPicker not dropdown'
status: completed
type: bug
priority: normal
created_at: 2026-08-03T00:19:02Z
updated_at: 2026-08-03T00:44:01Z
---

Two bugs in relationship management.

## Bug 1: duplicate relationship shows generic error
When a relationship already exists between two contacts and you add it again, the UI shows "An unexpected error occurred" instead of the specific message.
- Root cause: `src/server/web-api/contact-relationships.ts` POST `/:contactId/relationships` (~line 57) calls `relationships.add(...)` with NO try/catch, so the service's descriptive duplicate error (thrown in `src/services/relationships.ts` ~line 156: `A "<type>" relationship already exists between X and Y...`, and/or a UNIQUE constraint) propagates to the generic error middleware → 500 "An unexpected error occurred".
- Fix: catch the error in the create handler (and update handler) and surface the specific message with an appropriate status (e.g. 409 Conflict) via `ApiError`. Prefer having the service throw a typed/identifiable error for duplicates that the handler maps cleanly (mirror the pattern used in `relationship-types.ts` which catches and maps to `ApiError(400, ...)`). Ensure the duplicate case is detected reliably (both the pre-check and the UNIQUE(contact_id, related_contact_id, relationship_type) constraint). The web UI (RelationshipEditor) should then display that message.

## Bug 2: contact dropdown is horrific — use the ContactPicker
The "Add relationship" modal on a contact profile uses a plain `<Select>` to pick the related contact (`web/src/pages/contacts/SubEntityEditors.tsx` RelationshipEditor ~line 238, `data-testid="rel-contact"`, fed by `contactOptions` prop from `web/src/pages/contacts/ContactProfileView.tsx` ~line 42/423).
- Replace it with the same lovely people picker used on the "+ New" create screens: `ContactPicker` (`web/src/components/ContactPicker.tsx`), used in `web/src/pages/quickCreate.tsx` as `<ContactPicker mode="single" label=... value={contactId} onChange={setContactId} />`. Read that component + usage for the exact API.
- Since ContactPicker self-searches/loads contacts, remove the now-unnecessary `contactOptions` plumbing from ContactProfileView + RelationshipEditor (or keep the prop optional if simpler, but the goal is the nice searchable picker). Preserve the `related_contact_id` being submitted and exclude the current contact from selection.
- AUDIT: confirm no OTHER place in the app uses a regular dropdown for picking a contact and replace any that do. (From a grep, the only contact-picking `<Select>` is the relationship one; other Selects are for status/tag/sort/birthday/method-type filters — do NOT change those. Verify.)

## Testing
- Add/adjust integration test: POSTing a duplicate relationship returns the specific conflict error (not 500). Keep a happy-path + error-case per endpoint.
- Update the e2e that adds a relationship (search tests/e2e for `rel-contact` / relationship — likely `tests/e2e/contact-subentities.spec.ts`): it now uses the ContactPicker (`contact-picker-search` + `contact-picker-row`) instead of selecting `rel-contact`. WRITE/UPDATE the spec but DO NOT run Playwright (orchestrator runs the full e2e suite at the end).
- Run and ensure green: `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test` (vitest).

## Checklist
- [x] Duplicate relationship returns specific conflict message (service typed error + handler mapping, create + update)
- [x] RelationshipEditor uses ContactPicker (single-select, excludes current contact)
- [x] Remove/simplify contactOptions plumbing in ContactProfileView
- [x] Audit + confirm no other contact-picking dropdowns remain (`rg 'rel-contact|contactOptions|<Select[^>]*(contact|Contact)' web/src tests/e2e` found no contact picker dropdowns; remaining contact-named selects are status/sort filters)
- [x] Integration test for duplicate error
- [x] Update relationship e2e to use ContactPicker (do not run playwright)
- [x] typecheck + lint + vitest green
