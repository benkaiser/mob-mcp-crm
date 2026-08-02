---
# mob-crm-a4y3
title: Rich detail layouts for timeline entities
status: completed
type: feature
priority: normal
created_at: 2026-08-02T23:48:10Z
updated_at: 2026-08-02T23:54:27Z
---

The reminder detail page has a rich, juiced-up layout (hero, badges, countdown, stat grid, description, meta) but activities, notes, life-events, gifts, debts, and tasks still render as a bland raw `<dl>` field dump in EntityDetail.tsx. Generalize the reminder-detail styling into shared `detail__*` classes and build resource-specific rich body layouts for each entity type.

## Checklist
- [ ] Generalize reminder-detail CSS into shared detail__* classes
- [ ] Build generic RichDetail layout component
- [ ] Activity rich layout (type icon, badges, occurred-at highlight, stat grid)
- [ ] Note rich layout (prominent body, pinned badge)
- [ ] Life event rich layout
- [ ] Gift rich layout (cost, occasion, direction, status)
- [ ] Debt rich layout (amount highlight, direction, status)
- [ ] Task rich layout (due-date countdown, priority, status)
- [ ] Refactor ReminderBody onto shared component
- [ ] Preserve existing e2e data-testids
- [ ] Run typecheck, lint, unit + e2e tests