---
# mob-crm-uq5p
title: Contact CRUD & Sub-entities
status: todo
type: epic
priority: high
created_at: 2026-02-09T00:05:39Z
updated_at: 2026-02-09T00:05:39Z
parent: mob-crm-bkbs
---

Implement full contact management — the core of the CRM.

## Scope
- Contact service: create, get, update, soft-delete, list (with pagination)
- Contact fields: first_name, last_name, nickname, maiden_name, gender, pronouns, avatar_url
- Birthday handling (3 modes: full date, month+day, approximate age)
- Contact status (active, archived, deceased with optional date)
- Favorite/starred flag
- How-we-met fields (date, location, through contact, description)
- Work information (job_title, company, industry, work_notes)
- Contact methods sub-entity (CRUD, multiple types, primary flag)
- Addresses sub-entity (CRUD, partial addresses allowed, primary flag)
- Food preferences sub-entity (dietary restrictions, allergies, favorites, dislikes, notes)
- Custom fields sub-entity (CRUD, key-value with optional grouping)
- MCP tool definitions for all of the above
- Integration tests for all service methods
- Unit tests for birthday parsing and age calculation