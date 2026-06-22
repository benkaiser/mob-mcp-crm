---
# mob-crm-x4oa
title: vCard (.vcf) parser + importer + tests
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:51:38Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-bd9r
---

Import contacts from vCard (.vcf) — the universal format from Apple/iOS/Outlook/Android.

## Design
- Parse vCard 3.0/4.0: FN/N (names), NICKNAME, EMAIL (+TYPE), TEL (+TYPE), ADR, BDAY, ORG/TITLE, URL, NOTE, PHOTO (store avatar_url if URL; skip/embed base64 photos as out-of-scope note), CATEGORIES->tags.
- Map to NormalizedContact[] and run the shared import pipeline.
- Handle multiple VCARDs per file; tolerate missing fields + folding/line-continuation; charset.
- Endpoint POST /web/api/import/vcard (and /api/v1 equivalent later) accepting file upload.

## Checklist
- [x] vCard parser (3.0/4.0, multi-card, folding, common fields)
- [x] Map to NormalizedContact + run pipeline
- [x] Upload endpoint + result summary
- [x] Test fixtures: Apple, Google, Outlook exports + edge cases
- [x] Tests: parsing correctness + import summary + dedup
