---
# mob-crm-uj8b
title: 'E2E: Navigation, dashboard & not-found'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:49:06Z
updated_at: 2026-05-30T03:33:15Z
parent: mob-crm-awqs
---

E2E spec: tests/e2e/navigation.spec.ts. Owns: web/src/pages/Dashboard.tsx, NotFound.tsx, web/src/components/AppShell.tsx (testids already added by harness — coordinate, only read), tests/e2e/navigation.spec.ts. To avoid conflict with the harness on AppShell, do NOT edit AppShell; rely on harness testids.

- Dashboard (/app/) renders summary cards/counts; reflects seeded data.
- Every sidebar nav link navigates to the right route and highlights active.
- Unknown route (/app/does-not-exist) → NotFound page.
- Deep-link directly to a contact profile URL while authenticated loads it (SPA history fallback).

## Checklist
- [x] Dashboard cards render w/ seeded data
- [x] Each nav link routes + active state
- [x] Unknown route → NotFound
- [x] Deep-link to profile loads
