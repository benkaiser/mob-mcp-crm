---
# mob-crm-jc2l
title: Timeline overview pages stack instead of replacing (render throw leaves stale DOM)
status: completed
type: bug
priority: normal
created_at: 2026-08-03T00:29:27Z
updated_at: 2026-08-03T00:37:04Z
---

Clicking the Timeline overview nav items (Activities/Notes/Reminders/Tasks/Debts/Gifts) causes pages to STACK in the main content pane instead of replacing — multiple overviews render at once (screenshot shows Activities + Reminders + Notes simultaneously on /app/reminders). Console shows: `Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'replace')` during navigation.

## Root cause
- wouter-preact `<Switch>` (node_modules/wouter-preact/src/index.js) renders exactly ONE matched route (verified). So multiple routes are NOT matching.
- The real cause: a routed component throws during render on navigation. Preact does NOT unwind already-committed sibling DOM when a subsequent diff throws, so the previous route's DOM stays mounted and the next route is appended → pages stack.
- The throw is `.replace` on undefined. On the overview pages the only `.replace` on the render path is `humanize()` in `web/src/pages/EntityOverview.tsx` (line ~168: `value.replace(/_/g,' ')`). With the user's imported (Monica) data, some humanized field (type/status/priority/frequency) is undefined for at least one item, so `humanize(undefined)` throws while mounting the newly-navigated overview → stale DOM from the previous overview remains.

## Fix
1. Make EntityOverview render helpers defensive so they can never throw on missing data: `humanize()` returns '' for null/undefined; `formatMoney()` guards non-finite amount; guard `note.body.slice(...)` when body is missing.
2. Add resilience so a render error in routed content can never stack pages again: wrap the routed content (the <Switch>) in a small ErrorBoundary that renders a fallback and recovers on location change (so a throw shows a message instead of leaving stale DOM).

## Checklist
- [ ] Guard humanize/formatMoney/note-body in EntityOverview
- [ ] Add ErrorBoundary around routed content (recovers on navigation)
- [ ] Rebuild web; verify overviews replace (no stacking) and no console error
- [ ] Add a regression test if practical (e.g. overview renders with an item missing a humanized field)
- [ ] typecheck + lint + vitest green
