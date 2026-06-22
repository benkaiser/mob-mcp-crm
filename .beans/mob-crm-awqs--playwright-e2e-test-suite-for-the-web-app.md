---
# mob-crm-awqs
title: Playwright E2E test suite for the web app
status: completed
type: epic
priority: normal
created_at: 2026-05-30T02:47:15Z
updated_at: 2026-05-30T13:28:21Z
---

Comprehensive Playwright end-to-end tests covering every major user scenario through the Preact SPA (/app).

Decisions (from user):
- Selectors: add data-testid attributes to SPA components where helpful; prefer role/text otherwise.
- Harness: Playwright `webServer` builds the SPA + runs the real server (tsx) serving /app at one origin. Tests register fresh real accounts against a temp data dir.
- Scope: both self-hosted (unlimited) and hosted free/paid plan-gating.

Architecture: shared harness + fixtures land first (separate bean), then one bean per feature area. Each feature bean owns its own e2e spec file AND the page component(s) it adds testids to, to keep parallel work conflict-free. Shared components (AppShell nav, ui/* primitives) get their testids in the harness bean only.

Test location: tests/e2e/*.spec.ts (Playwright). Existing tests/e2e/mcp-protocol.test.ts is a vitest test and must stay excluded from the Playwright runner.