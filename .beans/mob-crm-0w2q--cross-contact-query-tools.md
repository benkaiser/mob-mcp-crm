---
# mob-crm-0w2q
title: Cross-Contact Query Tools
status: completed
type: epic
priority: normal
created_at: 2026-02-17T12:44:53Z
updated_at: 2026-02-17T12:54:31Z
---

Add broad-scale query tools that operate across all contacts, enabling the LLM to answer questions like 'who has a birthday coming up?', 'what notes have I written recently?', and 'who am I neglecting?' without N+1 tool calls. Currently, almost all list/query tools are scoped to a single contact. These new tools will provide efficient cross-contact queries with JOINs, denormalized responses (contact name/id included), smart defaults, composable filters, and consistent pagination.