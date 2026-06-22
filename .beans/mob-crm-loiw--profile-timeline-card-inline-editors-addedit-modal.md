---
# mob-crm-loiw
title: Profile timeline-card inline editors — add/edit modals for notes, activities, life events, reminders, tasks, gifts, debts
status: completed
type: feature
priority: normal
created_at: 2026-05-30T14:50:03Z
updated_at: 2026-05-30T14:52:40Z
parent: mob-crm-yafe
---

The right-column timeline cards on the contact profile (`ContactProfileView`) previously rendered data but had no create/edit affordance. This bean adds modal editors (matching the `SubEntityEditors.tsx` pattern: `Modal` + `<form>` + `useSave`) for each entity and wires them through the existing `Section.onAdd` slot.

## Checklist
- [x] Add `NoteEditor`, `ActivityEditor`, `LifeEventEditor`, `ReminderEditor`, `TaskEditor`, `GiftEditor`, `DebtEditor` in `web/src/pages/contacts/SubEntityEditors.tsx`.
- [x] Extend `Editor` union in `ContactProfileView.tsx` and add `onAdd` per right-column `<Section>`.
- [x] Add inline `RowActions` (Edit / Delete) on each right-column row, sharing the existing `deleteSub` confirm dialog.
- [x] Reverted the `count` badge added in mob-crm-ed4k now that the right column has its own primary affordance again (consistent with the left column).
- [x] Tweak `.sub-row__meta` CSS to make the meta link grow and to suppress link underline so the inline action buttons sit cleanly on the right.
- [x] `npx tsc --noEmit` from `web/` passes.