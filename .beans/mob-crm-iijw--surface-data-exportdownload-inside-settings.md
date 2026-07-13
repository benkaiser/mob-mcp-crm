---
# mob-crm-iijw
title: Surface data export/download inside Settings
status: completed
type: feature
priority: normal
created_at: 2026-07-13T00:04:00Z
updated_at: 2026-07-13T00:11:55Z
parent: mob-crm-rqef
---

Data export already exists and works (DataExport page at route /data, backed by GET /web/api/export producing mob-crm-export-<date>.json), but it is only reachable via a sidebar nav item ambiguously labelled 'Data' (AppShell.tsx). Users looking for account actions don't find it — it feels missing. Surface export where users expect account-level actions: in Settings.

## Requirements
- Add an 'Export / Download your data' section to Settings (web/src/pages/Settings.tsx), near profile/account controls.
- Reuse the existing export logic from web/src/pages/DataExport.tsx (statistics fetch from /web/api/export/statistics + blob download from /web/api/export). Factor the download logic into a small shared helper/hook so both the /data page and Settings use one implementation (avoid duplication).
- Show a short description (what's included, JSON format) and a Download button with busy state + toast feedback, matching existing Settings sections.
- Keep the existing /data page working; this adds a second, more discoverable entry point.
- Optional: mention on the page that this covers 'download all my data' for GDPR/portability.

## Files
- web/src/pages/Settings.tsx (new section)
- web/src/pages/DataExport.tsx (extract shared download helper)
- possibly web/src/api/ (shared export helper) 

## Checklist
- [x] Extract shared export/download helper from DataExport
- [x] Add Export section to Settings using the shared helper
- [x] Busy state + toast feedback consistent with other Settings sections
- [x] Verify /data page still works
- [x] Test/e2e: export section visible in Settings and triggers a download