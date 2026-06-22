---
# mob-crm-8w2f
title: 'E2E: Duplicate detection & merge'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:33:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/duplicates.spec.ts. Owns: web/src/pages/contacts/ContactDuplicates.tsx, tests/e2e/duplicates.spec.ts.

- Seed two near-identical contacts via API → /app/contacts/duplicates lists the pair with a reason.
- Trigger merge → contacts combined; verify only one remains and merged data is intact.
- No duplicates → empty state.

## Checklist
- [x] Duplicate pair detected & listed
- [x] Merge combines contacts
- [x] Empty state when none
