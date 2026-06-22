---
# mob-crm-ajen
title: 'Import UI host (tabs: Monica SQL, vCard, Google CSV)'
status: completed
type: feature
priority: low
created_at: 2026-05-29T13:50:14Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-2py4
---

A unified import page hosting all importers; wires to the importers built in epic 8.

## Design
- SPA import page with tabs: Monica SQL (existing importMonicaExport), vCard (.vcf), Google Contacts CSV.
- File upload -> POST to the relevant import endpoint -> show result summary (per-entity counts, warnings, skipped duplicates). Quota-aware messaging on hosted free tier.
- Migrate/keep the existing /web/import (Monica) functionality; move into this host.

## Checklist
- [x] Import page with format tabs + file upload per tab
- [x] Wire Monica (existing) + vCard + Google CSV endpoints (endpoints from epic 8)
- [x] Result summary display (counts/warnings/dedup) + quota messaging
- [x] Tests: each import endpoint integration happy+error; UI render
