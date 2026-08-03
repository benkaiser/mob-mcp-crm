---
# mob-crm-3tym
title: 'Simplify custom relationship type form: auto snake_case, Label-first'
status: completed
type: task
priority: normal
created_at: 2026-08-03T00:11:35Z
updated_at: 2026-08-03T00:14:50Z
---

Follow-up to mob-crm-h9xm (custom relationship types). The Settings form currently exposes a raw snake_case "Value" field which confuses users. Make the snake_case id automatic and only show human-friendly fields.

## Current state
- Settings section `RelationshipTypesSection` in `web/src/pages/Settings.tsx` (~lines 73-170) has three inputs: Value (snake_case, required, testid `relationship-type-value`), Label (optional, `relationship-type-label`), Inverse value (required, `relationship-type-inverse`). List rows show label + mono value + inverse.
- Web-api `src/server/web-api/relationship-types.ts`: createSchema requires `value` and `inverse_value`; `label` optional.
- Service `CustomRelationshipTypeService` in `src/services/relationships.ts` (create/update/list/mergedList). Migration `015-custom-relationship-types.sql`: columns id, user_id, value, label (nullable), inverse_value (NOT NULL), UNIQUE(user_id, value).
- Web client: `web/src/api/relationship-types.ts`.

## Desired behaviour
1. In the Settings form, show only two fields: **Label** (REQUIRED — it informs the value) and **Inverse value** (optional).
2. Auto-generate the snake_case `value` from the Label (slugify: lowercase, non-alphanumeric to underscore, collapse repeats, trim underscores). Do this in the SERVICE layer so it is consistent (not just the UI).
3. **Inverse value defaults to the Label if left blank** (i.e. symmetric, the inverse resolves to the same type). If an inverse IS provided, derive its snake_case the same way for storage.
4. Do NOT show the raw snake_case id as a required input. The list row should display Label + Inverse in a human-friendly way (the snake value can be shown subtly or omitted).
5. Keep uniqueness handling: if the derived value collides with an existing one for that user, return a clear error (or disambiguate) rather than a raw constraint error.

## Implementation notes
- Update the service create/update to accept a required `label`, derive `value` from it, and default `inverse_value` to the derived value when the inverse is blank (deriving snake_case from a provided inverse label). Add a small slugify helper.
- Update web-api createSchema: `label` required; `value` optional/removed (derived); `inverse_value` optional. Keep the error mapping.
- Update `web/src/api/relationship-types.ts` client + types accordingly.
- Update the Settings form + its e2e assertions (the value input goes away; label becomes required; inverse optional).
- Consider whether `label` should become NOT NULL in the schema; if adding a migration, keep existing rows valid (backfill label from value). Prefer enforcing "required" at the API/UI layer if a migration is risky — document the choice.

## Checklist
- [x] Service: slugify + derive value from label; inverse defaults to label; update create/update
- [x] Web-api schema: label required, value derived, inverse_value optional
- [x] Web client + types updated
- [x] Settings form shows only Label (required) + Inverse (optional)
- [x] List row shows human-friendly Label + Inverse
- [x] Tests updated (service + web-api + e2e)
- [x] typecheck + lint + vitest green


## Implementation notes from this follow-up

- Kept migration 015 unchanged: `label` remains nullable for existing rows; label-required is enforced in service/API/UI to avoid a risky schema migration.
- The service derives custom values with `slugify(label)` and defaults blank inverse values to the derived value.
