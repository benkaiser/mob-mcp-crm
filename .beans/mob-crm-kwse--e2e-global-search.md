---
# mob-crm-kwse
title: 'E2E: Global search'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:06:49Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/search.spec.ts. Owns: web/src/pages/Search.tsx, tests/e2e/search.spec.ts. Add testids to search input/results.

- Topbar search box → navigates to /app/search?q=...
- Search page returns matches across entity types (seed a contact + note + activity via API).
- No-results state renders empty state.
- Clicking a result navigates to the right detail/profile.

## Checklist
- [x] Topbar search navigates
- [x] Cross-entity matches shown
- [x] Empty state on no match
- [x] Result click → correct route
