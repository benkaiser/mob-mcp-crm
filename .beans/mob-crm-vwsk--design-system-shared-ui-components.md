---
# mob-crm-vwsk
title: Design system / shared UI components
status: completed
type: task
priority: high
created_at: 2026-05-29T13:47:58Z
updated_at: 2026-05-29T15:02:05Z
parent: mob-crm-rl0m
---

Minimal, reusable UI primitives so every CRUD view is consistent and quick to build. Keep it hand-rolled and tiny (no component library).

## Components
- Buttons (primary/secondary/danger), form fields (text/textarea/select/date/checkbox/multi-select/tag-input), form layout + inline validation display.
- DataTable/list with sort headers + pagination control + empty/loading/error states.
- Modal/dialog (for create/edit + confirm-delete), Drawer (optional).
- Toast notifications, Confirm dialog helper.
- Card, Tabs (for contact profile sections), Badge/Chip (tags, statuses), Avatar (initials/avatar_url).
- Date/relative-time formatting utils; currency formatting (debts/gifts).
- Reuse CSS variables/colors from existing _head.ejs for visual continuity.

## Checklist
- [x] Buttons + form field primitives + validation display
- [x] List/table with sort + pagination + empty/loading/error
- [x] Modal + Confirm + Toast
- [x] Tabs, Card, Badge/Chip, Avatar
- [x] Formatting utils (date, relative time, currency)
- [x] Shared stylesheet/tokens aligned with existing palette
- [x] Lightweight render tests for key primitives
