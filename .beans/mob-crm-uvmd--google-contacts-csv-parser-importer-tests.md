---
# mob-crm-uvmd
title: Google Contacts CSV parser + importer + tests
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:51:38Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-bd9r
---

Import from Google Contacts CSV export.

## Design
- Parse Google's CSV column layout (Name, Given/Family, Nickname, multiple Email 1/2 + Type, Phone 1/2 + Type, Address fields, Organization Name/Title, Birthday, Notes, Labels/Groups -> tags). Handle Google's "::: " multi-value separators + many empty columns.
- Map to NormalizedContact[] and run shared pipeline.
- Endpoint POST /web/api/import/google-csv accepting file upload.

## Checklist
- [x] Google CSV parser (column mapping + multi-value handling)
- [x] Map to NormalizedContact + run pipeline
- [x] Upload endpoint + result summary
- [x] Test fixtures: real-shaped Google export + edge cases
- [x] Tests: parsing correctness + import summary + dedup
