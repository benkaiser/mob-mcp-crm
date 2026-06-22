---
# mob-crm-gusl
title: 'Epic: Web CRUD — Contacts & profile (centerpiece)'
status: completed
type: epic
priority: high
created_at: 2026-05-29T13:45:30Z
updated_at: 2026-05-29T15:31:40Z
parent: mob-crm-ehb6
---

The centerpiece of the web app: contact list with filters/sorts, and the rich contact profile page rendering the already-enriched contact_get payload, plus full CRUD on contacts and all sub-entities.

## Goals
- Internal API endpoints + Preact views for: contact list (filter/sort/paginate), contact detail/profile, create/edit/delete/restore, merge + duplicate detection.
- Sub-entity CRUD on the profile: contact methods, addresses, custom fields, food preferences, relationships, tags, notes (notes also in epic 4 — keep on profile here).
- Reuse `ContactService.get()` enriched payload for the profile (one call returns everything).
- Quota: contact_create enforces the plan contact cap (free=11) with a clear upgrade message.

## Children (long tail — one per sub-surface)
- Contacts internal API (list/get/create/update/delete/restore)
- Contact list view (filters, sorts, pagination, search box)
- Contact profile view (read) — renders enriched payload, tabbed/sectioned
- Contact create/edit form (incl. birthday modes)
- Contact merge + duplicate detection UI
- Contact methods CRUD (API + UI on profile)
- Addresses CRUD (API + UI)
- Custom fields CRUD (API + UI)
- Food preferences edit (API + UI)
- Relationships CRUD (API + UI, bidirectional, met-through)
- Tags assign/unassign on contact (API + UI)

Blocked by Epics 1 & 2.
