# API and interface audit

<p class="lead">Mob exposes three interfaces over the same services: the authenticated Preact web app via `/web/api`, the token-authenticated public REST API via `/api/v1`, and MCP tools over `/mcp`.</p>

## Authentication surfaces

| Surface | Path | Auth |
|---|---|---|
| Web app API | `/web/api/*` | `mob_session` cookie plus CSRF for mutations. |
| Public REST API | `/api/v1/*` | `Authorization: Bearer mob_...` API token with `read` or `write` scope; docs at `/api/v1/docs` and `/api/v1/openapi.json` are public. |
| MCP | `/mcp` | OAuth 2.0 PKCE bearer token in persistent mode; direct ephemeral session in `--forgetful` mode. |

## Capability audit table

| Capability / UI action | Internal web API (`/web/api`) | MCP tool(s) | Public REST API (`/api/v1`) | Notes |
|---|---|---|---|---|
| Current user / plan | `GET /me` | `prime`, `manage_settings` | `GET /me` | Web includes email verification and beta flags. |
| Account profile, password, sessions, connections | `/account/profile`, `/account/password`, `/account/sessions`, `/account/connections`, account delete | No direct account CRUD except settings/push helpers | Not available | Web-only self-service. |
| API tokens | `GET/POST/DELETE /tokens` | Not available | Tokens authenticate REST but cannot manage themselves | Web-only management. |
| Webhooks | `GET/POST/GET/PATCH/DELETE /webhooks`, deliveries, test | Not available | Webhook deliveries only | Web-only management. |
| Dashboard cards and streak | `GET /dashboard` | `data_statistics`, `upcoming_birthdays`, `upcoming_reminders`, `contacts_needing_attention` | Not directly; combine stats/search/reminders | Streak is currently internal web API only. |
| Audit log | `GET /audit-log` | Not available | Not available | Internal web UI only. |
| List/search contacts | `GET /contacts` | `contact_list`, `global_search` | `GET /contacts`, `GET /search` | Web and REST include filters; MCP can also use global search. |
| Contact details | `GET /contacts/:id` plus sub-entity routes | `contact_get` | `GET /contacts/{id}` plus sub-resource routes | MCP `contact_get` returns an aggregated profile. |
| Create/update/delete/restore contacts | `POST /contacts`, `PATCH/DELETE /contacts/:id`, `POST /contacts/:id/restore` | `contact_create`, `contact_update`, `contact_delete`, `contact_restore` | Same REST paths | All surfaces support soft delete and restore. |
| Duplicate detection and merge | `GET /contacts/duplicates`, `POST /contacts/:id/merge` | `contact_find_duplicates`, `contact_merge` | Not available | Web and MCP only. |
| Favorites / starred contacts | `GET/PATCH /contacts` with `is_favorite` | `contact_create`, `contact_update`, `contact_list` | `GET/PATCH /contacts` with `is_favorite` | Supported as a contact field. |
| Contact methods | `GET/POST/PATCH/DELETE /contacts/:contactId/methods` | `contact_method_manage` | `GET/POST/PATCH/DELETE /contacts/{id}/methods` | REST uses method id sub-routes. |
| Addresses | `GET/POST/PATCH/DELETE /contacts/:contactId/addresses` | `address_manage` | `GET/POST/PATCH/DELETE /contacts/{id}/addresses` | Supported everywhere. |
| Custom fields | `GET/POST/PATCH/DELETE /contacts/:contactId/custom-fields` | `custom_field_manage` | `GET/POST/PATCH/DELETE /contacts/{id}/custom-fields` | Supported everywhere. |
| Food preferences | `GET/PUT/PATCH /contacts/:contactId/food-preferences` | `food_preferences_get`, `food_preferences_upsert` | `GET/PUT /contacts/{id}/food-preferences` | Web accepts PATCH too; REST documents PUT. |
| Relationships on contacts | `GET/POST/PATCH/DELETE /contacts/:contactId/relationships` | `relationship_manage` | `GET/POST/DELETE /contacts/{id}/relationships` | Relationship update is web + MCP; REST delete only after create. |
| Relationship type management | `GET /relationship-types`, `GET/POST/PATCH/DELETE /relationship-types/custom` | `relationship_manage` accepts canonical and custom types | Not available | Web Settings manages custom relationship types. |
| Tags management | `GET/POST/PATCH/DELETE /tags` | `tag_manage` | `GET/POST/PATCH/DELETE /tags` | Tags have names only. |
| Assign/unassign contact tags | `GET/POST/DELETE /contacts/:contactId/tags` | `tag_manage` actions `tag_contact`, `untag_contact` | `GET/POST/DELETE /contacts/{id}/tags` | Supported everywhere. |
| Notes list/search | `GET /notes` | `note_list` | `GET /notes`, `GET /notes/search` | MCP search is consolidated in `note_list`. |
| Notes CRUD/restore | `GET/POST/PATCH/DELETE /notes/:id`, `POST /notes/:id/restore` | `note_manage` | Same REST paths | Supported everywhere. |
| Activities and Activity Log | `GET /activities` | `activity_list` | `GET /activities` | MCP supports `days_back`/`since` activity-log mode. |
| Activities CRUD/restore | `/activities`, `/activities/:id`, `/activities/:id/restore` | `activity_manage` | Same REST paths | Supported everywhere. |
| Activity types | `GET/POST/PATCH/DELETE /activities/types` | `activity_type_manage` | Same REST paths | Supported everywhere. |
| Life events | `GET/POST /life-events`, `GET/PATCH/DELETE /life-events/:id`, restore | `life_event_manage` | Same REST paths | Supported everywhere. |
| Reminders | `GET/POST /reminders`, `GET/PATCH/DELETE /reminders/:id`, restore, complete, snooze, dismiss | `reminder_manage`, `upcoming_reminders` | Same REST paths | Supported everywhere. |
| Tasks | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id`, restore, complete | `task_manage` | Same REST paths | Supported everywhere. |
| Debts and summary | `GET/POST /debts`, `GET /debts/summary`, item CRUD, restore, settle | `debt_manage` | Same REST paths | Supported everywhere. |
| Gifts and tracker stats | `GET/POST /gifts`, item CRUD/restore | `gift_manage`, `gift_list` | `GET /gifts`, `GET /gifts/stats`, item CRUD/restore | Public REST has explicit `/gifts/stats`; MCP `gift_list` can return tracker stats. |
| Timeline | `GET /timeline` | `contact_timeline` | `GET /timeline` | Unified per-contact history. |
| Global search | `GET /search` | `global_search` | `GET /search` | Supported everywhere. |
| Data export and statistics | `GET /export`, `GET /export/statistics` | `data_export`, `data_statistics` | `GET /export`, `GET /export/stats` | Naming differs: web uses `statistics`, REST uses `stats`. |
| Imports | `POST /import/vcard`, `/import/google-csv`, preview routes, `/import/monica` | Not available | Not available | Web-only import for Monica, Google CSV, and vCard. |
| Notifications | Not exposed under `/web/api` | `notification_list`, `notification_create`, `notification_read` | Not available | MCP-only tool surface plus server push delivery internals. |
| Batch operations | Not available | `batch_create_contacts`, `batch_tag_contacts`, `batch_create_activities` | Not available | MCP-only context-efficient bulk writes. |
| Settings | Account/settings web APIs | `manage_settings`, `manage_push_notifications` | Not available | Web and MCP only. |
| Push notifications | `/api/push/*` and `/web/notifications` server routes; not `/web/api` | `manage_push_notifications` opens management URL | Not available | Browser/PWA feature, not public REST. |

## Public REST endpoint inventory

The public REST API is documented by OpenAPI at `/api/v1/openapi.json` and rendered at `/api/v1/docs`. It covers identity, contacts and sub-resources, activities, activity types, life events, notes, reminders, timeline, gifts, debts, tasks, tags, search, export, and stats. It does **not** expose account management, imports, dashboard streak, audit log, custom relationship type management, duplicate merge, notifications, settings, API-token management, or webhook management.

## Internal web API inventory

The web app uses `/web/api` routers for `me`, contacts, contact methods, addresses, custom fields, food preferences, relationships, tags, activities, life events, notes, reminders, timeline, gifts, debts, tasks, relationship types, dashboard, audit log, search, export, import, tokens, webhooks, and account management.
