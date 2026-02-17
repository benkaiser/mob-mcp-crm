---
# mob-crm-1o4j
title: global_search tool
status: completed
type: feature
priority: normal
created_at: 2026-02-17T12:46:12Z
updated_at: 2026-02-17T12:54:14Z
parent: mob-crm-0w2q
---

Add a \`global_search\` MCP tool that searches across all entity types (contacts, notes, activities, life events, gifts, tasks) in a single query.

## Motivation

Users often remember *something* about a topic but not where they stored it: "search for anything about Tokyo" or "find everything related to the wedding." Currently the LLM would need to call 6+ separate tools and collate results. A single entry point for cross-entity search is essential for natural recall.

## Tool Specification

**Name:** \`global_search\`

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`query\` | string (required) | - | Search term |
| \`entity_types\` | string[] | all types | Optional: filter to specific types: 'contacts', 'notes', 'activities', 'life_events', 'gifts', 'tasks' |
| \`limit_per_type\` | number (1-50) | 10 | Max results per entity type |

**Returns:** Grouped results by entity type:
\`\`\`json
{
  "results": {
    "contacts": [
      { "id": "c1", "match_field": "company", "display": "Jane Smith (Acme Corp)", "snippet": "..." }
    ],
    "notes": [
      { "id": "n1", "title": "Trip planning", "snippet": "...Tokyo itinerary...", "contact_id": "c1", "contact_name": "Jane Smith", "date": "2026-01-15" }
    ],
    "activities": [
      { "id": "a1", "title": "Dinner discussion", "snippet": "...talked about Tokyo trip...", "contact_name": "Jane Smith", "date": "2026-01-10" }
    ],
    "life_events": [],
    "gifts": [],
    "tasks": []
  },
  "total_matches": 5
}
\`\`\`

## Implementation Notes

- Run parallel LIKE queries across each entity type's searchable text fields:
  - **contacts**: first_name, last_name, nickname, company, job_title, work_notes
  - **notes**: title, body
  - **activities**: title, description
  - **life_events**: title, description, event_type
  - **gifts**: name, description, occasion
  - **tasks**: title, description
- Use UNION ALL or run separate queries and merge in the service layer (separate queries may be cleaner for different result shapes)
- Always include contact_name and contact_id in non-contact results for context
- Include a \`snippet\` field with the matching text (truncated to ~200 chars around the match)
- Exclude all soft-deleted entities
- Consider future upgrade path to SQLite FTS5 for better performance (but LIKE is fine for personal CRM scale)

## Checklist

- [ ] Create a new SearchService (or add to an existing service)
- [ ] Implement per-entity-type LIKE queries with snippet extraction
- [ ] Merge results into grouped response format
- [ ] Add contact_name denormalization for all entity types
- [ ] Register \`global_search\` tool in mcp-server.ts with Zod schema
- [ ] Add tests for: multi-entity matches, entity_types filter, snippet generation, soft-delete exclusion, limit_per_type
