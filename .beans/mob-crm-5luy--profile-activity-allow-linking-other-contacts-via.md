---
# mob-crm-5luy
title: 'Profile +Activity: allow linking other contacts via ContactPicker accordion'
status: completed
type: feature
priority: normal
created_at: 2026-08-03T01:26:31Z
updated_at: 2026-08-03T01:31:28Z
---

On a contact profile, the +Activity (ActivityEditor in SubEntityEditors.tsx) always submits participant_contact_ids: [contactId] and offers no way to add OTHER participants (comment at ~line 364 acknowledges multi-participant authoring only lives on the standalone new-activity page). Add a collapsible accordion 'Add other people to this activity?' containing a multi ContactPicker (excludeIds=[profile contactId]) so users can link additional contacts. Submit participant_contact_ids = ded“ contactId + others. Prefill others from existing.participants (minus the profile contact) in edit mode.