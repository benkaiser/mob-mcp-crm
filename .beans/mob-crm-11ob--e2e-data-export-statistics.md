---
# mob-crm-11ob
title: 'E2E: Data export & statistics'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:33:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/data-export.spec.ts. Owns: web/src/pages/DataExport.tsx, tests/e2e/data-export.spec.ts. Add testids to export buttons/stats.

- /app/data shows CRM statistics (counts). Seed some data via API and assert numbers reflect it.
- Trigger export (JSON download) → assert the download contains expected top-level keys (contacts, version). Use Playwright download handling.

## Checklist
- [x] Statistics reflect seeded data
- [x] Export download has contacts + version
