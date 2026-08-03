---
# mob-crm-7ulk
title: Replace emoji entity icons with cohesive SVG icon set (light/dark aware)
status: completed
type: task
priority: normal
created_at: 2026-08-03T00:41:02Z
updated_at: 2026-08-03T00:43:40Z
---

The timeline entity icons are emoji (📌 📝 🔔 📋 💰 🎁 🌟 ✅ 🤝 📞 📹 💬 ✉️), which look unprofessional/LLM-generated and don't adapt to light/dark mode. Replace them with a cohesive, professional inline-SVG icon set that inherits the current text color (so it flips automatically between light and dark themes).

## Where the emoji are used (scope to these two files ONLY)
- `web/src/pages/EntityOverview.tsx`: the `configs` object has an `icon: '📌'` etc. per resource (activities/notes/reminders/tasks/debts/gifts), rendered in the page header at line ~128 `<span aria-hidden="true">{config.icon}</span>`.
- `web/src/pages/EntityDetail.tsx`: the rich hero renders `<span class="detail__icon" aria-hidden="true">{view.icon}</span>` (~line 455). Icons come from: `ACTIVITY_ICONS` map (phone_call 📞, video_call 📹, text_message 💬, in_person 🤝, email ✉️, activity 🎉, other 📌), notes (📝/📌), life-events (🌟), gifts (🎁), debts (💰), tasks (✅/📋), reminders (🔔).
- Do NOT touch `web/src/pages/contacts/ContactProfileView.tsx` (a different feature/agent owns it; its 🎂 birthday badge is out of scope).

## Approach
- Use the **Lucide** icon set (MIT licensed, clean 24x24 stroke icons). Fetch the exact `<path>`/shape data for each icon from the Lucide source (e.g. https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/<name>.svg) so the paths are accurate — do NOT hand-draw approximations.
- Create a reusable `web/src/ui/Icon.tsx` component: `<Icon name="bell" size={20} />` that renders an inline `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width/height=size aria-hidden>`. Because it uses `stroke="currentColor"`, it automatically inherits the surrounding text color and adapts to light/dark. Export it from `web/src/ui/index.ts` if there's a barrel.
- Suggested name mapping (pick the closest Lucide icons; adjust if a better fit exists):
  - activities overview: `activity` (or `calendar-clock`); per type — phone_call→`phone`, video_call→`video`, text_message→`message-circle`, in_person→`users` (or `handshake` if available), email→`mail`, activity→`sparkles` (or `party-popper`), other→`pin`.
  - notes: `file-text` (pinned note → `pin`).
  - reminders: `bell`.
  - tasks: `list-checks` (or `square-check-big`); completed → `circle-check-big`.
  - debts: `wallet` (or `banknote`).
  - gifts: `gift`.
  - life-events: `star` (or `sparkles`).
- Change the `icon` fields from emoji strings to Lucide icon NAME strings, and render them via `<Icon name={...} />` in both the EntityOverview page header and the EntityDetail hero. In the EntityDetail hero the icon sits on a colored gradient (white text) — `currentColor` makes it render white there, which is correct; verify the existing `.detail__icon` styling still centers/sizes it (adjust the CSS in `web/src/ui/styles.css` if needed, e.g. ensure the svg is sized well within the circle; make additive/scoped CSS changes).
- Keep `aria-hidden="true"` on decorative icons.

## Validation
- `npm run typecheck`, `npm run lint` (0 errors; warnings OK), `npm test`, and `npm run build:web` must succeed.
- If an e2e references the emoji (unlikely), update it. WRITE specs but DO NOT run Playwright (orchestrator runs it later).

## Checklist
- [x] Create reusable Icon component (Lucide paths, currentColor, size prop)
- [x] Replace EntityOverview per-resource icons
- [x] Replace EntityDetail hero icons (incl. per-activity-type + task done/undone + pinned note)
- [x] Verify .detail__icon sizing/centering in light & dark
- [x] typecheck + lint + vitest + build green
