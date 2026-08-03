---
# mob-crm-f19y
title: Activity detail doesn't show related contacts (participants)
status: completed
type: bug
priority: normal
created_at: 2026-08-03T01:24:53Z
updated_at: 2026-08-03T01:31:28Z
---

Activities relate to contacts via activity_participants (many-to-many), returned as a participants: string[] of contact IDs by GET /activities/:id. The web EntityDetail rich body only renders a single data.contact_id (which activities do not have), so the activity detail page never shows the related contacts. Fix: in EntityDetail, resolve participant contact names and render a Participants block (avatar + link per contact). Add an e2e assertion that a seeded activity's participant contact is shown on its detail page.