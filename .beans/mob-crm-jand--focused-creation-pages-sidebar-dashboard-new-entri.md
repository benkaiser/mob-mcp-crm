---
# mob-crm-jand
title: Focused-creation pages — sidebar & dashboard +New entries for note, activity, reminder, task
status: completed
type: feature
priority: normal
created_at: 2026-05-30T14:50:03Z
updated_at: 2026-05-30T14:57:34Z
parent: mob-crm-yafe
---

Adds dedicated `+ New …` flows that work from anywhere (sidebar + dashboard), each landing on a focused full-page form whose first job is contact selection.

## Visual hierarchy
- `+ New contact` stays the primary gradient CTA in the sidebar — untouched.
- `+ New note / activity / reminder / task` render BELOW the CTA as a compact "Quick add" group of ghost links (smaller font, muted color, separator above) — clearly secondary.
- Dashboard quick-add row uses `.btn--secondary .btn--sm` (small secondary buttons) wrapped in a single `Card`.

## Checklist
- [x] Build `ContactPicker` (`web/src/components/ContactPicker.tsx`) supporting single and multi modes, in-memory search, selected-chips, `initialIds` preselect.
- [x] Add CSS for `.contact-picker`, sidebar quick-add (`.sidebar__quick`, `.sidebar__quick-link`), dashboard quick-add row (`.quick-add-row`).
- [x] Build `/notes/new`, `/activities/new`, `/reminders/new`, `/tasks/new` pages in `web/src/pages/quickCreate.tsx`. Notes/reminders use single picker; activities multi (1–N participants); tasks single + optional. Each reads `?contact_id=` query for preselect.
- [x] Register routes in `web/src/app.tsx` BEFORE the `/:id` detail routes so the new routes match first.
- [x] Add Quick-add link group to sidebar in `AppShell.tsx` under the primary CTA.
- [x] Add Quick-add row Card to `Dashboard.tsx`.
- [x] `npx tsc --noEmit` from web/ passes.
- [x] SPA build succeeds.
- [x] Full Playwright E2E suite: 58 of 59 pass; the one failure (`a11y.spec.ts` — Modal escape closes dialog) is unrelated and pre-existing (`Modal.tsx` has unrelated debug `console.log`s that were already on master; no diff vs HEAD for that file).