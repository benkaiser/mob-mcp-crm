---
# mob-crm-m3cx
title: 'E2E: Import (vCard, Google CSV, Monica)'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:08:00Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/import.spec.ts. Owns: web/src/pages/ImportPage.tsx, tests/e2e/import.spec.ts. Add testids to the import tabs/file inputs/result.

Cover all three import tabs on /app/import:
- vCard: paste/upload a small .vcf → Preview shows count → Import → result counts; contact appears in list.
- Google CSV: same flow with a small CSV.
- Monica CRM: upload a small valid Monica SQL snippet → confirm destructive dialog → result shows per-entity counts. (Use a tiny hand-crafted INSERT INTO `contacts` snippet; the real 8.7MB file is too big for a fixture.) Also assert the confirm dialog can be cancelled.

## Checklist
- [x] vCard preview + import
- [x] Google CSV import
- [x] Monica import w/ confirm dialog
- [x] Monica confirm cancel aborts
- [x] Imported contacts appear in list
