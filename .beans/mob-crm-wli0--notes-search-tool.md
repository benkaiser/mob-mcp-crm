---
# mob-crm-wli0
title: notes_search tool
status: completed
type: feature
priority: normal
created_at: 2026-02-17T12:46:12Z
updated_at: 2026-02-17T12:51:21Z
parent: mob-crm-0w2q
---

Add a \`notes_search\` MCP tool that searches and lists notes across all contacts with filtering and sorting.

## Motivation

Notes are the richest freeform data in the CRM. Users frequently want to find notes by content ("what did I write about the project?"), browse recent notes, or filter notes by contact group. Currently \`note_list\` requires a contact_id — there's no way to search across all notes.

## Tool Specification

**Name:** \`notes_search\`

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| \`query\` | string | - | Optional: search term matched against title and body (LIKE-based) |
| \`tag_name\` | string | - | Optional: filter to notes belonging to contacts with this tag |
| \`contact_id\` | string | - | Optional: filter to a specific contact |
| \`is_pinned\` | boolean | - | Optional: filter by pinned status |
| \`sort_by\` | enum | 'updated_at' | Sort field: 'created_at' or 'updated_at' |
| \`sort_order\` | enum | 'desc' | Sort direction: 'asc' or 'desc' |
| \`page\` | number | 1 | Page number |
| \`per_page\` | number | 20 | Results per page |

**Returns:**
\`\`\`json
{
  "data": [
    {
      "id": "note123",
      "title": "Project discussion",
      "body": "We talked about the timeline...",
      "body_truncated": false,
      "is_pinned": false,
      "created_at": "2026-01-15T10:00:00Z",
      "updated_at": "2026-01-15T10:00:00Z",
      "contact_id": "abc123",
      "contact_name": "Jane Smith"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
\`\`\`

## Implementation Notes

- JOIN notes with contacts to get contact_name, and optionally JOIN contact_tags + tags for tag filtering
- LIKE search on both title and body columns: \`(title LIKE '%query%' OR body LIKE '%query%')\`
- Consider truncating body in results to first ~500 chars to keep response size manageable, with a \`body_truncated\` boolean flag
- All filters are AND-combined
- Exclude soft-deleted notes AND soft-deleted contacts
- Filter by user_id through contacts table

## Checklist

- [ ] Add \`searchNotes(userId, options)\` method to NoteService
- [ ] Write SQL query with JOINs for contacts and optional tag filtering
- [ ] Implement LIKE-based search across title and body
- [ ] Add body truncation logic (500 chars) with \`body_truncated\` flag
- [ ] Register \`notes_search\` tool in mcp-server.ts with Zod schema
- [ ] Add tests for: text search, tag filtering, pinned filter, sort options, pagination, cross-contact results
