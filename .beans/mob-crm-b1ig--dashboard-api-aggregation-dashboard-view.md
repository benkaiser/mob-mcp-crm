---
# mob-crm-b1ig
title: Dashboard API aggregation + dashboard view
status: completed
type: feature
priority: normal
created_at: 2026-05-29T13:50:14Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-2py4
---

A real dashboard replacing the current near-empty EJS dashboard.

## Design
- Internal API: GET /web/api/dashboard -> { todays_reminders, upcoming_birthdays, contacts_needing_attention, recent_activity, debt_summary, gift_wishlist_nudges, usage:{contacts,contactCap} }. Reuse existing services (reminders, upcoming_birthdays, contacts_needing_attention, debts summary, activities recent).
- UI: card-based dashboard (Preact) summarizing the above with links into detail views; quota usage chip (X/11 on hosted free tier; hidden when unlimited/self-hosted).

## Checklist
- [x] Dashboard aggregation endpoint reusing existing services
- [x] Dashboard view (cards + links)
- [x] Usage chip (hosted free only)
- [x] Tests: aggregation endpoint happy+error; view render
