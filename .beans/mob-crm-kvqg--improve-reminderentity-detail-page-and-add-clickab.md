---
# mob-crm-kvqg
title: Improve reminder/entity detail page and add clickable contact link
status: completed
type: feature
priority: normal
created_at: 2026-06-22T00:05:59Z
updated_at: 2026-06-22T00:12:44Z
---

The generic EntityDetail page renders a raw key-value dump (id, contact_id, timestamps). Improve: humanize field labels, hide redundant internal fields, format the contact as a clickable link to the contact profile (fetch contact name). Applies to reminders and other timeline entities sharing EntityDetail.