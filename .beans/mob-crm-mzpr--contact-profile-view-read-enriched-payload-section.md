---
# mob-crm-mzpr
title: Contact profile view (read) — enriched payload, sectioned
status: completed
type: feature
priority: high
created_at: 2026-05-29T13:48:34Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-gusl
---

The centerpiece read view. Renders the enriched contact_get payload in one screen.

## Design
- Header: avatar, name/nickname/pronouns, favorite toggle, status badge, age/birthday display, company/job, edit/delete actions.
- Tabbed or sectioned body: Overview (contact methods, addresses, work, how-we-met, food prefs, custom fields), Relationships, Notes (pinned first), Timeline (or link), Activities, Life events, Reminders, Tasks, Gifts, Debts (+ net balance).
- Each section has inline add/edit/delete affordances that open the sub-entity CRUD (separate beans) — this bean wires the read layout + slots; sub-entity editors land in their own beans.
- Quick actions: log activity, add note, add reminder (deep-links to quick-add forms).

## Checklist
- [x] Header with key identity + favorite/status + actions
- [x] Sectioned/tabbed layout for all sub-entities from enriched payload
- [x] Slots/affordances for sub-entity editors (filled by sibling beans)
- [x] Quick-action buttons
- [x] Loading/error/not-found states
- [x] Test: renders all sections from a seeded enriched contact
