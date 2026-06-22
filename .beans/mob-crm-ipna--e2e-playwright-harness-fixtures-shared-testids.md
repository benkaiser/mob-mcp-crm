---
# mob-crm-ipna
title: 'E2E: Playwright harness, fixtures & shared testids'
status: completed
type: task
priority: normal
created_at: 2026-05-30T02:47:46Z
updated_at: 2026-05-30T02:59:03Z
parent: mob-crm-awqs
blocking:
    - mob-crm-4sxc
    - mob-crm-gf5z
    - mob-crm-t8po
    - mob-crm-ojgb
    - mob-crm-kwse
    - mob-crm-8w2f
    - mob-crm-m3cx
    - mob-crm-11ob
    - mob-crm-iqtj
    - mob-crm-9lsx
    - mob-crm-uj8b
---

FOUNDATION BEAN — must land before all feature specs. Owned by the lead (not an agent).

Set up Playwright for the web app:
- Install @playwright/test (devDependency, use --legacy-peer-deps to match the existing @eslint/js peer situation) + `npx playwright install chromium`.
- playwright.config.ts at repo root: testDir 'tests/e2e', testMatch '**/*.spec.ts' (so the existing vitest mcp-protocol.test.ts is NOT picked up), single chromium project, baseURL from webServer, trace on-first-retry.
- webServer: build the SPA (npm run build:web) then run the real server via tsx on a dedicated port with a temp MOB_DATA_DIR, serving /app. Provide a way to run in hosted mode (MOB_HOSTED=true) for plan-gating specs.
- Fixtures (tests/e2e/fixtures/): a `register a fresh account` helper returning an authenticated context; a `loginAs` helper; helpers to seed data via the internal API (/web/api/*) with session cookie + CSRF.
- Add data-testid to SHARED components only: AppShell sidebar nav links, topbar search box, logout link, and common ui/* primitives (Button, Modal/ConfirmDialog, Toast, ErrorBanner, Tabs, Badge, EmptyState, Spinner). Document the testid naming convention in a comment block.
- Add npm scripts: test:e2e and test:e2e:ui.
- Deliver smoke.spec.ts: register → land on /app dashboard → see nav.

## Checklist
- [x] Install Playwright + chromium
- [x] playwright.config.ts (excludes vitest e2e test)
- [x] webServer builds SPA + runs real server, temp data dir
- [x] Hosted-mode toggle for plan-gating specs
- [x] Registration + login fixtures
- [x] API-seeding helpers (session+CSRF)
- [x] Shared testids: nav, search, logout, ui primitives
- [x] testid naming convention documented
- [x] npm scripts test:e2e / test:e2e:ui
- [x] smoke.spec.ts green
