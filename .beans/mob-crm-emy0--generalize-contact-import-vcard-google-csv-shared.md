---
# mob-crm-emy0
title: Generalize contact import (vCard + Google CSV + shared pipeline)
status: completed
type: feature
priority: normal
created_at: 2026-05-29T14:25:27Z
updated_at: 2026-05-29T14:30:12Z
---

Build shared import pipeline plus vCard and Google CSV parsers, dedup + quota aware. New files only: src/services/import-pipeline.ts, import-vcard.ts, import-google-csv.ts + tests/fixtures + integration tests.