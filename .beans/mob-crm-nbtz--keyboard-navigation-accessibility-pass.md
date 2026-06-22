---
# mob-crm-nbtz
title: Keyboard navigation & accessibility pass
status: in-progress
type: task
priority: normal
created_at: 2026-05-30T14:09:45Z
updated_at: 2026-05-30T15:04:21Z
parent: mob-crm-w31z
---

Make the SPA fully keyboard-operable and screen-reader friendly. Prompted by
the sidebar typeahead being mouse-only (no arrow-key + Enter navigation).

## Checklist

[x] Typeahead search: ArrowUp/ArrowDown move a highlight through the flat list
of results, Enter activates the highlighted result (or falls to "see all"
when none highlighted), Escape closes the dropdown. ARIA combobox roles
(role=combobox/listbox/option, aria-activedescendant, aria-expanded).
[x] Visible focus rings on all interactive elements (links, buttons, inputs,
nav items) — global :focus-visible outline added; .input opts out in favour of
its own ring. Audited that nothing suppresses outlines.
[x] Modals: focus trap, Escape to close, return focus to the trigger on close.
Modal.tsx rewritten with useLayoutEffect (pre-paint focus move + listener),
Tab/Shift+Tab wrap at boundaries, restoreRef returns focus on close.
[x] Tab order is logical on each screen (sidebar → main content). Skip link is
the first tab stop; DOM order is sidebar then <main>.
[x] Icon-only buttons (theme toggle, tag remove ×, modal close) have
aria-labels — audited; decorative glyphs (＋ CTA, avatar initials) are
aria-hidden.
[x] Forms: label/for associations, aria-invalid + error association on fields.
Field.tsx clones the control to inject id, aria-describedby (hint/error) and
aria-invalid; error has role=alert.
[x] Skip-to-content link for keyboard users. AppShell renders a .skip-link that
jumps focus to #main-content (main has tabIndex={-1}).
[ ] Contrast: verify text/background pairs meet WCAG AA in both themes.

## Keyboard shortcuts (Stripe-style)

[x] `?` from anywhere outside a text field opens a cheat-sheet overlay (the
accessible Modal). Single keys c/n/a/r/t create contact/note/activity/
reminder/task; `g`-prefix sequences (g d/c/s/i/e/,) navigate; `/` focuses
search. Suppressed while typing or with ⌘/Ctrl/Alt held.
KeyboardShortcuts.tsx, wired into app.tsx alongside ToastHost.

## Tests

• tests/e2e/a11y.spec.ts — skip link first tab stop, modal returns focus on
Escape, form label/required associations (3 passing).
• tests/e2e/shortcuts.spec.ts — ? overlay open/close, single-key + g-prefix
nav, / focus, typing-suppression (5 passing).

## Done so far

• Typeahead keyboard nav (Arrow/Enter/Escape + ARIA combobox) — implemented.
• Focus rings, accessible Modal (focus trap), Field ARIA, skip link — done.
• Stripe-style keyboard shortcuts + help overlay — done.

## Remaining

• WCAG AA contrast audit across both themes — not yet measured.
