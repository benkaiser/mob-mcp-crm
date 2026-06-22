---
# mob-crm-1c24
title: Data export + statistics view
status: completed
type: feature
priority: low
created_at: 2026-05-29T13:50:14Z
updated_at: 2026-05-29T15:31:33Z
parent: mob-crm-2py4
---

Web surface for full data export and CRM statistics.

## Design
- Internal API: GET /web/api/export (JSON download via DataExportService) + GET /web/api/statistics (data_statistics).
- UI: data page with "Export all data (JSON)" download button + statistics panel (total contacts, interactions, reminders, etc.).

## Checklist
- [x] Export + statistics API endpoints
- [x] Data page (export button + stats panel)
- [x] Tests: export returns valid JSON; statistics happy path; render
