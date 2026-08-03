# MCP setup and architecture

<p class="lead">Mob is an MCP server using Streamable HTTP. Point your MCP client at the server's `/mcp` URL and authenticate with the built-in OAuth flow.</p>

## Connecting a client

Use the base URL of your Mob server plus `/mcp`:

```json
{
  "mcpServers": {
    "mob": {
      "url": "https://your-mob.example.com/mcp"
    }
  }
}
```

- **Transport:** Streamable HTTP at `/mcp`.
- **Authentication:** OAuth 2.0 with PKCE in persistent mode. The client opens the authorization URL, you sign in or create an account, consent, and the client exchanges the code for a bearer token.
- **Forgetful/demo mode:** starting the server with `--forgetful` (or `MOB_FORGETFUL=true`) uses ephemeral per-session data and bypasses login for MCP initialization. Data is isolated and destroyed when the session ends or expires.

## Context minimization design

Mob's MCP API is designed for AI clients with limited context windows.

### The `prime` tool

The server registers a `prime` tool that clients should call first. It returns compact context: current user identity and self-contact id, tags, up to 200 recently updated contacts with compact names/tag ids, and recent notes. This lets an agent resolve names and taxonomy without loading every full profile.

Prompt templates in `src/server/prompts.ts` also instruct clients to prime context before workflows such as adding contacts, logging interactions, and finding connections.

### Consolidated manage tools

Instead of many tiny tools, Mob groups related CRUD actions behind `*_manage` tools with an `action` field. Examples:

- `relationship_manage` with `add`, `update`, `remove`, `list`
- `note_manage` with `create`, `update`, `delete`, `restore`
- `activity_manage` with `create`, `get`, `update`, `delete`, `restore`
- `activity_type_manage`, `life_event_manage`, `reminder_manage`, `gift_manage`, `debt_manage`, `task_manage`, `tag_manage`
- `manage_settings` and `manage_push_notifications`

This keeps the tool list shorter while preserving full behavior. Bulk tools (`batch_create_contacts`, `batch_tag_contacts`, `batch_create_activities`) further reduce back-and-forth for imports or large updates.

## Current MCP tool inventory

| Area | Tools |
|---|---|
| Contacts | `contact_create`, `contact_get`, `contact_update`, `contact_delete`, `contact_restore`, `contact_list`, `contact_merge`, `contact_find_duplicates` |
| Contact sub-entities | `contact_method_manage`, `address_manage`, `food_preferences_get`, `food_preferences_upsert`, `custom_field_manage` |
| Relationships | `relationship_manage` |
| Notes | `note_manage`, `note_list` |
| Tags | `tag_manage` |
| Activities | `activity_manage`, `activity_list`, `activity_type_manage` |
| Life events and timeline | `life_event_manage`, `contact_timeline` |
| Reminders and notifications | `reminder_manage`, `upcoming_reminders`, `notification_list`, `notification_create`, `notification_read` |
| Gifts, debts, tasks | `gift_manage`, `gift_list`, `debt_manage`, `task_manage` |
| Search and attention | `global_search`, `upcoming_birthdays`, `contacts_needing_attention` |
| Data and bootstrap | `data_export`, `data_statistics`, `prime` |
| Batch and settings | `batch_create_contacts`, `batch_tag_contacts`, `batch_create_activities`, `manage_settings`, `manage_push_notifications` |

## MCP prompts

Mob also registers prompts such as daily briefing, meeting prep, log interaction, add contact, gift ideas, relationship summary, weekly review, and find connections. These prompts are recipes that tell an AI client which tools to call and in what order.
