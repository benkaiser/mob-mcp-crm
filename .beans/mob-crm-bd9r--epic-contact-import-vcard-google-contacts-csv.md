---
# mob-crm-bd9r
title: 'Epic: Contact import — vCard / Google Contacts CSV'
status: completed
type: epic
priority: normal
created_at: 2026-05-29T13:46:14Z
updated_at: 2026-05-29T15:31:40Z
parent: mob-crm-ehb6
---

Generalize import beyond Monica SQL. Add standard, widely-exportable formats so users can move in from phones, Google, Apple, Outlook.

## Approach
Reuse the proven Monica import pattern (parser -> normalized records -> service-layer inserts, returning a summary with per-entity counts + warnings). Build a shared "import pipeline" abstraction so each format is just a parser feeding the same upsert/dedup core.

## Formats
- **vCard (.vcf)** — Apple Contacts, iOS, Outlook, Android all export this. Map vCard fields (FN/N, EMAIL, TEL, ADR, BDAY, ORG/TITLE, URL, NOTE, photo) to contacts + contact methods + addresses + birthday + work info + notes.
- **Google Contacts CSV** — Google's exported CSV column layout. Map name, emails, phones, addresses, organization, birthday, notes, labels->tags.
- **Dedup on import** — reuse contact_find_duplicates logic to skip/merge likely dupes; report skipped count.
- **Quota-aware** — in hosted free tier, importing must respect the 11-contact cap (stop + report when reached). Self-hosted: unlimited.

## Children
- Shared import pipeline abstraction (normalized record -> upsert + dedup + summary), refactor Monica importer onto it
- vCard (.vcf) parser + importer + tests (fixtures for Apple/Google/Outlook variants)
- Google Contacts CSV parser + importer + tests
- Import UI integration (tabs in the import host from epic 6) with progress + result summary + dedup report

Blocked by Epic 1 (quota) and Epic 6 (import UI host) for the UI child; parsers can start after Epic 1.
