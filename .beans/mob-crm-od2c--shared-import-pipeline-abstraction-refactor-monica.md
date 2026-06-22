---
# mob-crm-od2c
title: Shared import pipeline abstraction (refactor Monica onto it)
status: completed
type: task
priority: normal
created_at: 2026-05-29T13:51:38Z
updated_at: 2026-05-29T14:31:44Z
parent: mob-crm-bd9r
---

Create a shared import pipeline so each format is just a parser feeding a common upsert/dedup/summary core. Refactor the existing Monica importer onto it.

## Design
- Define a normalized intermediate record: NormalizedContact { core fields, methods[], addresses[], birthday, work, notes[], tags[], life_events[], etc. }.
- Pipeline: parse(format) -> NormalizedContact[] -> for each: dedup check (contact_find_duplicates logic) -> create via services (or merge/skip) -> accumulate summary { perEntity counts, warnings, skipped }.
- Quota-aware: stop creating when hosted free cap reached; report remaining as skipped-quota.
- Refactor importMonicaExport to produce NormalizedContact[] then run the shared pipeline (keep existing tests green).

## Checklist
- [x] NormalizedContact intermediate type
- [x] Shared pipeline (dedup + service upserts + summary + quota stop)
- [x] Refactor Monica importer onto pipeline (existing tests still pass)
- [x] Tests: pipeline dedup/skip/quota; Monica refactor parity
