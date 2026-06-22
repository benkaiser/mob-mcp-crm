---
# mob-crm-1p3o
title: 'E2E: Playwright harness, fixtures & shared testids'
status: scrapped
type: task
priority: normal
created_at: 2026-05-30T02:47:39Z
updated_at: 2026-05-30T02:51:49Z
---

FOUNDATION BEAN — must land before all feature specs. Owned by the lead (not an agent).

Set up Playwright for the web app:
- Install @playwright/test (devDependency, use --legacy-peer-deps to match the existing @eslint/js peer situation) + `npx playwright install chromium`.
- playwright.config.ts at repo root: testDir 'tests/e2e', testMatch '**/*.spec.ts' (so the existing vitest mcp-protocol.test.ts is NOT picked up), single chromium project, baseURL from webServer, trace on-first-retry.
- webServer: build the SPA (npm run build:web) then run the real server via tsx on a dedicated port with a temp MOB_DATA_DIR, serving /app. Provide a way to run in hosted mode (MOB_HOSTED=true) for plan-gating specs — likely a second project/config or an env toggle.
- Fixtures (tests/e2e/fixtures/): a `register a fresh account` helper (POST /auth/register or via the UI) returning an authenticated browser context; a `loginAs` helper; helpers to seed data via the internal API (/web/api/*) with the session cookie + CSRF, so feature specs don't each re-click the whole UI to arrange state.
- Add data-testid to SHARED components only: AppShell sidebar nav links (one per nav item), the topbar search box, the logout link, and the common ui/* primitives that every spec touches (Button, Modal/ConfirmDialog, Toast, ErrorBanner, Tabs, Badge, EmptyState, Spinner). Document the testid naming convention in a short comment block other agents will follow.
- Add npm scripts: `test:e2e` and `test:e2e:ui`.
- Deliver one tiny smoke spec (tests/e2e/smoke.spec.ts): register → land on /app dashboard → see nav.

## Checklist
- [ ] Install Playwright + chromium
- [ ] playwright.config.ts (excludes vitest e2e test)
- [ ] webServer builds SPA + runs real server, temp data dir
- [ ] Hosted-mode toggle for plan-gating specs
- [ ] Registration + login fixtures
- [ ] API-seeding helpers (session+CSRF)
- [ ] Shared testids: nav, search, logout, ui primitives
- [ ] testid naming convention documented
- [ ] npm scripts test:e2e / test:e2e:ui
- [ ] smoke.spec.ts green