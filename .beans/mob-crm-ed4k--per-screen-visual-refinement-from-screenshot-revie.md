---
# mob-crm-ed4k
title: Per-screen visual refinement from screenshot review
status: completed
type: task
priority: normal
created_at: 2026-05-30T13:52:06Z
updated_at: 2026-05-30T14:40:28Z
parent: mob-crm-w31z
---

Findings from full light+dark screenshot review (.design-preview/shots). Overall design is cohesive and strong; these are the remaining polish gaps, roughly in priority order.

## Checklist

### High impact
- [x] **Theme native form controls in dark mode.** Added `accent-color: var(--color-primary)` globally; custom-styled `.select` (themed SVG caret, no native chrome) and `input[type=file]::file-selector-button` (secondary-button look).
  - [x] "Mark as favorite" checkbox (contact-new.dark, contact-edit.dark) now uses brand accent
  - [x] "Choose File" button (import.dark) themed as secondary button
  - [x] `<select>` dropdowns: Status (contact form), and Status/Tag/Sort/Order filters (contacts-list) use Azure-themed appearance with custom caret
- [x] **Resolve contact-profile column asymmetry.** Read-only right-column summary cards (Recent notes, Activities, Life events, Reminders, Open tasks, Recent gifts, Active debts) now show a count Badge on the right edge, balancing the left column's `+ Add`/`Edit` affordances.

### Medium impact
- [x] **Tone down dark-mode profile banner gradient.** Dark mode now uses a deeper `linear-gradient(135deg, #1e3a8a, #0e7490)` with normal text colour instead of the full-saturation azure→cyan that "glowed" against the near-black canvas.
- [x] **Fix "WorkAdded" label spacing** (contact-edit). Added `gap: var(--space-2)` to `.form-section__summary` so the "Added" status suffix no longer sits flush against the section heading.

### Low impact / verify
- [x] **Clarify Import button state** (import). Verified intentional: the Import button is `disabled` until text is entered (`disabled={busy || !text.trim()}`), styled via app-wide `.btn:disabled { opacity: 0.6 }`. No change needed.