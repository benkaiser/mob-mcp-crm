---
# mob-crm-xplk
title: Custom contact-method types with configurable deep-link templates
status: completed
type: feature
created_at: 2026-08-03T03:46:51Z
updated_at: 2026-08-03T03:58:00Z
---

Let users maintain custom contact-method types and customise the deep-link ("link type") each type uses, with sensible defaults per built-in type (overridable in Settings). Render contact methods as clickable deep links on the profile.

## Current state
- `contact_methods.type` is a fixed CHECK enum (email, phone, whatsapp, telegram, signal, twitter, instagram, facebook, linkedin, website, other) — see `src/db/migrations/001-initial-schema.sql` (~line 79). Mirrored in `src/services/contact-methods.ts` (ContactMethodType), `web/src/api/types.ts` (~line 101), the `METHOD_TYPES` list + method editor in `web/src/pages/contacts/SubEntityEditors.tsx` (~line 12, 71), and the MCP tool `contact_method_manage` enum in `src/server/mcp-server.ts` (~line 325).
- Profile renders methods as PLAIN TEXT: `web/src/pages/contacts/ContactProfileView.tsx` "Contact methods" section shows `<strong>{m.type}</strong>: {m.value}` with no link.
- Latest migration is `018-audit-log.sql`.

## Requirements
1. **Deep-link templates per type.** Each contact-method type resolves its value into a link via a template containing a `{value}` placeholder. Provide BUILT-IN defaults (in code):
   - email → `mailto:{value}`
   - phone → `tel:{value}` (strip spaces)
   - whatsapp → `https://wa.me/{value}` (digits only)
   - telegram → `https://t.me/{value}` (strip a leading @)
   - signal → `https://signal.me/#p/{value}`
   - twitter → `https://x.com/{value}` (strip a leading @)
   - instagram → `https://instagram.com/{value}` (strip a leading @)
   - facebook → `https://m.me/{value}` (Messenger deep link, per request)
   - linkedin → `https://www.linkedin.com/in/{value}`
   - website → `{value}` (if it has no scheme, prepend `https://`)
   - other → no link (plain text)
   Implement a shared helper (e.g. `buildContactMethodLink(typeKey, value, template)`) that applies a per-type value transform (strip leading @, digits-only for phone/whatsapp, ensure scheme for website), then substitutes `{value}` (URL-encoding where appropriate). Keep it defensive (never throw; return null when there's no usable link).
2. **User overrides + custom types (Settings).** Add a user-scoped config so users can override a built-in type's link template AND add entirely custom types (key + label + link template). Migration `019`: a `contact_method_types` table (id, user_id FK cascade, key TEXT, label TEXT, link_template TEXT, created_at, updated_at, UNIQUE(user_id, key)). A row is present only when the user has customised/added a type; built-ins otherwise use the code defaults. Resolution order for a method of type X: user row for key=X (its template) → built-in default for X → none.
3. **Relax the DB CHECK** so custom type keys are allowed. Migration `019` must rebuild `contact_methods` WITHOUT the `type` CHECK (SQLite can't drop a CHECK via ALTER — do a table rebuild preserving all columns, data, the index, and FKs). Update the service (`contact-methods.ts`) + web-api (`src/server/web-api/contact-methods.ts`) validation to accept any non-empty type string. Relax the MCP `contact_method_manage` type from `z.enum(...)` to `z.string()` (keep the description listing the built-ins).
4. **Settings UI.** Add a "Contact method types" section to `web/src/pages/Settings.tsx` (follow existing section patterns, e.g. RelationshipTypesSection / TagsSection): list the built-in types with their (default or overridden) link template editable inline; let users add custom types (key/label/link template) and delete/reset custom ones. Use `{value}` as the documented placeholder in a hint.
5. **web-api endpoints.** A router (e.g. `src/server/web-api/contact-method-types.ts`) mounted at `/web/api/contact-method-types`: GET the merged list (built-ins + user overrides + custom, each with its resolved link_template) and GET/POST/PATCH/DELETE for user overrides/custom types. Forgetful mode: the merged read should still return built-ins; custom management is persistent-only (mirror how relationship-types.ts handles forgetful).
6. **Profile rendering.** In ContactProfileView's Contact methods section, render `{m.value}` as a clickable `<a target="_blank" rel="noopener noreferrer">` using the resolved link for `m.type` (fetch the merged type list once on the profile). Fall back to plain text when there's no link (e.g. type `other` or empty template). Keep label/primary badges.
7. **Method editor.** The type `<Select>` in the Activity... sorry, the ContactMethodEditor (SubEntityEditors.tsx ~line 71) should offer the merged list (built-ins + user custom types) instead of the hardcoded `METHOD_TYPES`.

## Testing & validation
- Service/unit tests for `buildContactMethodLink` covering each built-in default + a custom override + the value transforms + the no-link cases.
- Integration tests for the contact-method-types web-api (GET merged, create/override, delete; happy + error/forgetful) and that `contact_methods` now accepts a custom type after migration 019.
- Update existing tests that assume the enum/CHECK (search for contact method type assertions; the MCP/web-api validation change).
- e2e: Settings can add a custom type + override a template; a profile contact method renders as a link. You MAY run Playwright (you are the only active agent).
- Ensure green: `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test`, `npm run build`.

## Checklist
- [x] Shared buildContactMethodLink helper + built-in default templates + value transforms
- [x] Migration 019: contact_method_types table + rebuild contact_methods without the type CHECK (preserve data/index/FKs)
- [x] Service + web-api + MCP accept arbitrary type strings
- [x] contact-method-types web-api router (merged list + CRUD) mounted
- [x] Settings "Contact method types" section (edit templates, add/delete custom)
- [x] Profile renders methods as deep links; method editor uses merged type list
- [x] Tests (helper unit + web-api integration + e2e) and typecheck/lint/test/build green

## Implementation notes
- Built-in templates live in `src/services/contact-method-types.ts`; the SPA mirrors the defensive link builder in `web/src/lib/contact-method-links.ts` for profile rendering.
- A `NULL`/blank saved template intentionally disables links for that type; an absent user row falls back to the built-in default.
- Migration `019` rebuilds `contact_methods` by renaming/copying/dropping the old table, preserving existing rows and recreating `idx_contact_methods_contact`.
- Validation completed: `npm run typecheck`, `npm run lint` (0 errors, pre-existing warnings), `npm test`, `npm run build`, and `npx playwright test tests/e2e/settings.spec.ts`.
