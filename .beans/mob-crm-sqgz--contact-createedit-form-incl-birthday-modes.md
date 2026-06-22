---
# mob-crm-sqgz
title: Contact create/edit form (incl. birthday modes)
status: completed
type: feature
priority: high
created_at: 2026-05-29T13:48:34Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

Create and edit form for the core contact fields.

## Design
- Fields: first/last/nickname/maiden, gender, pronouns, avatar_url, status, favorite, job_title/company/industry/work_notes, how-we-met (date/location/met_through contact picker/description).
- Birthday control supporting all three modes: full date | month+day only | approximate age. UI switches inputs per mode; maps to birthday_mode + fields.
- Client + server (zod) validation; field-level error display.
- Create enforces quota (free tier) with clear messaging; edit not gated.
- Shared component for create + edit (prefill on edit).

## Checklist
- [x] All core fields
- [x] Birthday mode switcher (full/month-day/approx age)
- [x] met_through contact picker
- [x] Validation + error display
- [x] Create + edit reuse one component
- [x] Quota-aware create
- [x] Test: create happy path, edit prefilled, birthday-mode mapping, validation errors
