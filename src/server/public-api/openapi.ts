/**
 * Hand-authored OpenAPI 3.0 document for the Mob CRM public REST API.
 *
 * The spec describes every endpoint mounted by `createPublicApiRouter` under
 * `/api/v1` (see ./index.ts). Request/response bodies use intentionally loose
 * schemas — path/operation coverage matters more than exhaustive field typing.
 *
 * Exposed via the docs router (./docs-router.ts) at `/api/v1/openapi.json`.
 */

const API_DESCRIPTION = `
The Mob CRM public REST API.

## Authentication
All endpoints (except this documentation) require a personal API token passed as a
bearer token:

\`\`\`
Authorization: Bearer mob_xxxxxxxxxxxxxxxx
\`\`\`

Tokens carry **scopes**: \`read\` is required for safe methods (GET/HEAD/OPTIONS) and
\`write\` is required for state-changing methods (POST/PATCH/PUT/DELETE). A token
lacking the needed scope receives \`403 forbidden\`.

In hosted plans the API also requires the \`public_api\` entitlement; otherwise a
\`403\` is returned. Self-hosted instances treat everyone as unlimited.

## Response envelopes
Successful responses wrap the payload in \`{ "data": ..., "meta"?: ... }\`.
Errors return \`{ "error": { "code": string, "message": string, "details"?: any } }\`.

## Pagination
List endpoints accept \`page\` and \`per_page\` (max 100, default 25) query params and
return a \`meta\` object: \`{ total, page, per_page, total_pages }\`.

## Rate limiting
Requests are rate limited per token owner (fixed window). Exceeding the limit
returns \`429 rate_limited\` with a \`Retry-After\` header (seconds until reset).

## Webhooks
Subscribers receive signed \`POST\` deliveries. Each request includes an
\`X-Mob-Signature: sha256=<hmac>\` header — an HMAC-SHA256 of the raw JSON body keyed
by the webhook secret — and an \`X-Mob-Event\` header. Verify the signature with a
constant-time comparison. Supported event names:
\`contact.created\`, \`contact.updated\`, \`contact.deleted\`, \`activity.created\`,
\`reminder.due\`, \`task.created\`, \`task.completed\`. Subscribers may use \`*\` to
receive all events. The delivery body is \`{ "event": string, "data": object, "timestamp": string }\`.
`.trim();

/** Reusable `$ref` to the standard error envelope, as a JSON content body. */
function errorResponse(description: string): object {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  };
}

/** A standard data-envelope JSON response wrapping `dataSchema`. */
function dataResponse(description: string, dataSchema: object, paginated = false): object {
  const properties: Record<string, object> = { data: dataSchema };
  if (paginated) properties.meta = { $ref: '#/components/schemas/PaginationMeta' };
  return {
    description,
    content: {
      'application/json': {
        schema: { type: 'object', required: ['data'], properties },
      },
    },
  };
}

/** A JSON request body referencing a component schema. */
function jsonBody(schemaRef: string, required = true): object {
  return {
    required,
    content: { 'application/json': { schema: { $ref: schemaRef } } },
  };
}

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Resource identifier.',
};

function subIdParam(name: string, description: string): object {
  return { name, in: 'path', required: true, schema: { type: 'string' }, description };
}

const paginationParams = [
  { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'per_page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
  { name: 'include_deleted', in: 'query', required: false, schema: { type: 'boolean' } },
];

const contactIdQuery = {
  name: 'contact_id',
  in: 'query',
  required: true,
  schema: { type: 'string' },
  description: 'Contact the records belong to.',
};

const deletedResponse = dataResponse('Deletion acknowledgement.', { $ref: '#/components/schemas/DeleteResult' });
const objectResponse = (desc: string): object => dataResponse(desc, { type: 'object' });
const listResponse = (desc: string): object =>
  dataResponse(desc, { type: 'array', items: { type: 'object' } }, true);

/**
 * Build the complete OpenAPI 3.0 document object for the public API.
 */
export function buildOpenApiSpec(): object {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Mob CRM Public API',
      version: '1.0.0',
      description: API_DESCRIPTION,
      contact: { name: 'Mob CRM' },
      license: { name: 'AGPL-3.0' },
    },
    servers: [{ url: '/api/v1', description: 'Public API v1' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Identity', description: 'Token introspection.' },
      { name: 'Contacts', description: 'Contacts and their sub-resources.' },
      { name: 'Activities', description: 'Logged interactions and activity types.' },
      { name: 'Life Events', description: 'Significant contact milestones.' },
      { name: 'Notes', description: 'Free-form notes about contacts.' },
      { name: 'Reminders', description: 'Recurring or one-time reminders.' },
      { name: 'Timeline', description: 'Unified per-contact activity timeline.' },
      { name: 'Gifts', description: 'Gift ideas and tracking.' },
      { name: 'Debts', description: 'Money owed to or by contacts.' },
      { name: 'Tasks', description: 'To-dos, optionally linked to a contact.' },
      { name: 'Tags', description: 'User-defined tags.' },
      { name: 'Search', description: 'Cross-entity global search.' },
      { name: 'Export', description: 'Full data export and statistics.' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'mob_<token>',
          description: 'Personal API token with read and/or write scopes.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'not_found' },
                message: { type: 'string' },
                details: {},
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          required: ['total', 'page', 'per_page', 'total_pages'],
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            per_page: { type: 'integer' },
            total_pages: { type: 'integer' },
          },
        },
        DeleteResult: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            deleted: { type: 'boolean' },
          },
        },
        Contact: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            nickname: { type: 'string' },
            gender: { type: 'string' },
            pronouns: { type: 'string' },
            birthday_mode: { type: 'string', enum: ['full_date', 'month_day', 'approximate_age'] },
            birthday_date: { type: 'string' },
            status: { type: 'string', enum: ['active', 'archived', 'deceased'] },
            is_favorite: { type: 'boolean' },
            job_title: { type: 'string' },
            company: { type: 'string' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
        },
        ContactCreate: {
          type: 'object',
          required: ['first_name'],
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            nickname: { type: 'string' },
            maiden_name: { type: 'string' },
            gender: { type: 'string' },
            pronouns: { type: 'string' },
            avatar_url: { type: 'string' },
            birthday_mode: { type: 'string', enum: ['full_date', 'month_day', 'approximate_age'] },
            birthday_date: { type: 'string' },
            birthday_month: { type: 'integer', minimum: 1, maximum: 12 },
            birthday_day: { type: 'integer', minimum: 1, maximum: 31 },
            birthday_year_approximate: { type: 'integer' },
            status: { type: 'string', enum: ['active', 'archived', 'deceased'] },
            deceased_date: { type: 'string' },
            is_favorite: { type: 'boolean' },
            met_at_date: { type: 'string' },
            met_at_location: { type: 'string' },
            met_through_contact_id: { type: 'string' },
            met_description: { type: 'string' },
            job_title: { type: 'string' },
            company: { type: 'string' },
            industry: { type: 'string' },
            work_notes: { type: 'string' },
          },
        },
        ContactMethod: {
          type: 'object',
          required: ['type', 'value'],
          properties: {
            type: {
              type: 'string',
              enum: ['email', 'phone', 'whatsapp', 'telegram', 'signal', 'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other'],
            },
            value: { type: 'string' },
            label: { type: 'string' },
            is_primary: { type: 'boolean' },
          },
        },
        Address: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            street_line_1: { type: 'string' },
            street_line_2: { type: 'string' },
            city: { type: 'string' },
            state_province: { type: 'string' },
            postal_code: { type: 'string' },
            country: { type: 'string' },
            is_primary: { type: 'boolean' },
          },
        },
        CustomField: {
          type: 'object',
          required: ['field_name', 'field_value'],
          properties: {
            field_name: { type: 'string' },
            field_value: { type: 'string' },
            field_group: { type: 'string' },
          },
        },
        FoodPreferences: {
          type: 'object',
          properties: {
            dietary_restrictions: { type: 'array', items: { type: 'string' } },
            allergies: { type: 'array', items: { type: 'string' } },
            favorite_foods: { type: 'array', items: { type: 'string' } },
            disliked_foods: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
        },
        Relationship: {
          type: 'object',
          required: ['related_contact_id', 'relationship_type'],
          properties: {
            related_contact_id: { type: 'string' },
            relationship_type: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        TagAssignment: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            color: { type: 'string' },
          },
        },
        Activity: {
          type: 'object',
          required: ['type', 'occurred_at', 'participant_contact_ids'],
          properties: {
            type: {
              type: 'string',
              enum: ['phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other'],
            },
            title: { type: 'string' },
            description: { type: 'string' },
            occurred_at: { type: 'string' },
            duration_minutes: { type: 'integer' },
            location: { type: 'string' },
            activity_type_id: { type: 'string' },
            participant_contact_ids: { type: 'array', items: { type: 'string' } },
          },
        },
        ActivityType: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            icon: { type: 'string' },
          },
        },
        LifeEvent: {
          type: 'object',
          required: ['contact_id', 'event_type', 'title'],
          properties: {
            contact_id: { type: 'string' },
            event_type: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            occurred_at: { type: 'string' },
            related_contact_ids: { type: 'array', items: { type: 'string' } },
          },
        },
        Note: {
          type: 'object',
          required: ['contact_id', 'body'],
          properties: {
            contact_id: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
            is_pinned: { type: 'boolean' },
          },
        },
        Reminder: {
          type: 'object',
          required: ['contact_id', 'title', 'reminder_date'],
          properties: {
            contact_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            reminder_date: { type: 'string' },
            frequency: { type: 'string', enum: ['one_time', 'weekly', 'monthly', 'yearly'] },
          },
        },
        Gift: {
          type: 'object',
          required: ['contact_id', 'name', 'direction'],
          properties: {
            contact_id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            url: { type: 'string' },
            estimated_cost: { type: 'number' },
            currency: { type: 'string' },
            occasion: { type: 'string' },
            status: { type: 'string', enum: ['idea', 'planned', 'purchased', 'given', 'received'] },
            direction: { type: 'string', enum: ['giving', 'receiving'] },
            date: { type: 'string' },
          },
        },
        Debt: {
          type: 'object',
          required: ['contact_id', 'amount', 'direction'],
          properties: {
            contact_id: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            direction: { type: 'string', enum: ['i_owe_them', 'they_owe_me'] },
            reason: { type: 'string' },
            incurred_at: { type: 'string' },
          },
        },
        Task: {
          type: 'object',
          required: ['title'],
          properties: {
            contact_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            due_date: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          },
        },
        Tag: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            color: { type: 'string' },
          },
        },
      },
      responses: {
        Unauthorized: errorResponse('Missing, malformed, or invalid bearer token.'),
        Forbidden: errorResponse('Token lacks the required scope or plan entitlement.'),
        NotFound: errorResponse('The requested resource does not exist.'),
        ValidationError: errorResponse('Request body or query failed validation.'),
        RateLimited: errorResponse('Rate limit exceeded; see the Retry-After header.'),
      },
    },
    paths: buildPaths(),
  };
}

/** Build the `paths` object for every public API endpoint. */
function buildPaths(): Record<string, object> {
  const commonErrors = {
    '401': { $ref: '#/components/responses/Unauthorized' },
    '403': { $ref: '#/components/responses/Forbidden' },
    '429': { $ref: '#/components/responses/RateLimited' },
  };
  const withNotFound = { ...commonErrors, '404': { $ref: '#/components/responses/NotFound' } };
  const withValidation = { ...commonErrors, '422': { $ref: '#/components/responses/ValidationError' } };
  const writeErrors = { ...withNotFound, '422': { $ref: '#/components/responses/ValidationError' } };

  return {
    // ─── Identity ────────────────────────────────────────────────
    '/me': {
      get: {
        tags: ['Identity'],
        summary: 'Token introspection',
        description: 'Returns the authed user id, token scopes, plan usage and entitlements.',
        responses: { '200': objectResponse('Identity and entitlement info.'), ...commonErrors },
      },
    },

    // ─── Contacts ────────────────────────────────────────────────
    '/contacts': {
      get: {
        tags: ['Contacts'],
        summary: 'List contacts',
        parameters: [
          ...paginationParams,
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'archived', 'deceased'] } },
          { name: 'is_favorite', in: 'query', schema: { type: 'boolean' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'company', in: 'query', schema: { type: 'string' } },
          { name: 'tag_name', in: 'query', schema: { type: 'string' } },
          { name: 'sort_by', in: 'query', schema: { type: 'string' } },
          { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: { '200': dataResponse('Paginated contacts.', { type: 'array', items: { $ref: '#/components/schemas/Contact' } }, true), ...commonErrors },
      },
      post: {
        tags: ['Contacts'],
        summary: 'Create a contact',
        requestBody: jsonBody('#/components/schemas/ContactCreate'),
        responses: { '201': dataResponse('Created contact.', { $ref: '#/components/schemas/Contact' }), ...withValidation },
      },
    },
    '/contacts/{id}': {
      parameters: [idParam],
      get: {
        tags: ['Contacts'],
        summary: 'Get a contact profile',
        responses: { '200': dataResponse('Full contact profile.', { $ref: '#/components/schemas/Contact' }), ...withNotFound },
      },
      patch: {
        tags: ['Contacts'],
        summary: 'Update a contact',
        requestBody: jsonBody('#/components/schemas/ContactCreate'),
        responses: { '200': dataResponse('Updated contact.', { $ref: '#/components/schemas/Contact' }), ...writeErrors },
      },
      delete: {
        tags: ['Contacts'],
        summary: 'Soft-delete a contact',
        responses: { '200': deletedResponse, ...withNotFound },
      },
    },
    '/contacts/{id}/restore': {
      parameters: [idParam],
      post: {
        tags: ['Contacts'],
        summary: 'Restore a soft-deleted contact',
        responses: { '200': dataResponse('Restored contact.', { $ref: '#/components/schemas/Contact' }), ...withNotFound },
      },
    },
    '/contacts/{id}/methods': {
      parameters: [idParam],
      get: { tags: ['Contacts'], summary: 'List contact methods', responses: { '200': listResponse('Contact methods.'), ...withNotFound } },
      post: {
        tags: ['Contacts'],
        summary: 'Add a contact method',
        requestBody: jsonBody('#/components/schemas/ContactMethod'),
        responses: { '201': objectResponse('Created contact method.'), ...writeErrors },
      },
    },
    '/contacts/{id}/methods/{methodId}': {
      parameters: [idParam, subIdParam('methodId', 'Contact method id.')],
      patch: {
        tags: ['Contacts'],
        summary: 'Update a contact method',
        requestBody: jsonBody('#/components/schemas/ContactMethod'),
        responses: { '200': objectResponse('Updated contact method.'), ...writeErrors },
      },
      delete: { tags: ['Contacts'], summary: 'Delete a contact method', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/contacts/{id}/addresses': {
      parameters: [idParam],
      get: { tags: ['Contacts'], summary: 'List addresses', responses: { '200': listResponse('Addresses.'), ...withNotFound } },
      post: {
        tags: ['Contacts'],
        summary: 'Add an address',
        requestBody: jsonBody('#/components/schemas/Address'),
        responses: { '201': objectResponse('Created address.'), ...writeErrors },
      },
    },
    '/contacts/{id}/addresses/{addressId}': {
      parameters: [idParam, subIdParam('addressId', 'Address id.')],
      patch: {
        tags: ['Contacts'],
        summary: 'Update an address',
        requestBody: jsonBody('#/components/schemas/Address'),
        responses: { '200': objectResponse('Updated address.'), ...writeErrors },
      },
      delete: { tags: ['Contacts'], summary: 'Delete an address', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/contacts/{id}/custom-fields': {
      parameters: [idParam],
      get: { tags: ['Contacts'], summary: 'List custom fields', responses: { '200': listResponse('Custom fields.'), ...withNotFound } },
      post: {
        tags: ['Contacts'],
        summary: 'Add a custom field',
        requestBody: jsonBody('#/components/schemas/CustomField'),
        responses: { '201': objectResponse('Created custom field.'), ...writeErrors },
      },
    },
    '/contacts/{id}/custom-fields/{fieldId}': {
      parameters: [idParam, subIdParam('fieldId', 'Custom field id.')],
      patch: {
        tags: ['Contacts'],
        summary: 'Update a custom field',
        requestBody: jsonBody('#/components/schemas/CustomField'),
        responses: { '200': objectResponse('Updated custom field.'), ...writeErrors },
      },
      delete: { tags: ['Contacts'], summary: 'Delete a custom field', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/contacts/{id}/food-preferences': {
      parameters: [idParam],
      get: { tags: ['Contacts'], summary: 'Get food preferences', responses: { '200': objectResponse('Food preferences.'), ...withNotFound } },
      put: {
        tags: ['Contacts'],
        summary: 'Upsert food preferences',
        requestBody: jsonBody('#/components/schemas/FoodPreferences'),
        responses: { '200': objectResponse('Upserted food preferences.'), ...writeErrors },
      },
    },
    '/contacts/{id}/relationships': {
      parameters: [idParam],
      get: { tags: ['Contacts'], summary: 'List relationships', responses: { '200': listResponse('Relationships.'), ...withNotFound } },
      post: {
        tags: ['Contacts'],
        summary: 'Add a relationship',
        requestBody: jsonBody('#/components/schemas/Relationship'),
        responses: { '201': objectResponse('Created relationship.'), ...writeErrors },
      },
    },
    '/contacts/{id}/relationships/{relationshipId}': {
      parameters: [idParam, subIdParam('relationshipId', 'Relationship id.')],
      delete: { tags: ['Contacts'], summary: 'Delete a relationship', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/contacts/{id}/tags': {
      parameters: [idParam],
      get: { tags: ['Contacts'], summary: 'List a contact’s tags', responses: { '200': listResponse('Tags.'), ...withNotFound } },
      post: {
        tags: ['Contacts'],
        summary: 'Assign a tag to a contact',
        requestBody: jsonBody('#/components/schemas/TagAssignment'),
        responses: { '201': objectResponse('Assigned tag.'), ...writeErrors },
      },
    },
    '/contacts/{id}/tags/{tagId}': {
      parameters: [idParam, subIdParam('tagId', 'Tag id.')],
      delete: { tags: ['Contacts'], summary: 'Unassign a tag from a contact', responses: { '200': deletedResponse, ...withNotFound } },
    },

    // ─── Activities ──────────────────────────────────────────────
    '/activities/types': {
      get: { tags: ['Activities'], summary: 'List activity types', responses: { '200': listResponse('Activity types.'), ...commonErrors } },
      post: {
        tags: ['Activities'],
        summary: 'Create an activity type',
        requestBody: jsonBody('#/components/schemas/ActivityType'),
        responses: { '201': objectResponse('Created activity type.'), ...withValidation },
      },
    },
    '/activities/types/{id}': {
      parameters: [idParam],
      patch: {
        tags: ['Activities'],
        summary: 'Update an activity type',
        requestBody: jsonBody('#/components/schemas/ActivityType'),
        responses: { '200': objectResponse('Updated activity type.'), ...writeErrors },
      },
      delete: { tags: ['Activities'], summary: 'Delete an activity type', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/activities': {
      get: {
        tags: ['Activities'],
        summary: 'List activities',
        parameters: [
          ...paginationParams,
          { name: 'contact_id', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': dataResponse('Paginated activities.', { type: 'array', items: { $ref: '#/components/schemas/Activity' } }, true), ...commonErrors },
      },
      post: {
        tags: ['Activities'],
        summary: 'Create an activity',
        requestBody: jsonBody('#/components/schemas/Activity'),
        responses: { '201': dataResponse('Created activity.', { $ref: '#/components/schemas/Activity' }), ...withValidation },
      },
    },
    '/activities/{id}': {
      parameters: [idParam],
      get: { tags: ['Activities'], summary: 'Get an activity', responses: { '200': dataResponse('Activity.', { $ref: '#/components/schemas/Activity' }), ...withNotFound } },
      patch: {
        tags: ['Activities'],
        summary: 'Update an activity',
        requestBody: jsonBody('#/components/schemas/Activity'),
        responses: { '200': dataResponse('Updated activity.', { $ref: '#/components/schemas/Activity' }), ...writeErrors },
      },
      delete: { tags: ['Activities'], summary: 'Soft-delete an activity', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/activities/{id}/restore': {
      parameters: [idParam],
      post: { tags: ['Activities'], summary: 'Restore an activity', responses: { '200': dataResponse('Restored activity.', { $ref: '#/components/schemas/Activity' }), ...withNotFound } },
    },

    // ─── Life events ─────────────────────────────────────────────
    '/life-events': {
      get: {
        tags: ['Life Events'],
        summary: 'List a contact’s life events',
        parameters: [contactIdQuery, ...paginationParams],
        responses: { '200': listResponse('Paginated life events.'), ...withNotFound, '422': { $ref: '#/components/responses/ValidationError' } },
      },
      post: {
        tags: ['Life Events'],
        summary: 'Create a life event',
        requestBody: jsonBody('#/components/schemas/LifeEvent'),
        responses: { '201': dataResponse('Created life event.', { $ref: '#/components/schemas/LifeEvent' }), ...writeErrors },
      },
    },
    '/life-events/{id}': {
      parameters: [idParam],
      get: { tags: ['Life Events'], summary: 'Get a life event', responses: { '200': dataResponse('Life event.', { $ref: '#/components/schemas/LifeEvent' }), ...withNotFound } },
      patch: {
        tags: ['Life Events'],
        summary: 'Update a life event',
        requestBody: jsonBody('#/components/schemas/LifeEvent'),
        responses: { '200': dataResponse('Updated life event.', { $ref: '#/components/schemas/LifeEvent' }), ...writeErrors },
      },
      delete: { tags: ['Life Events'], summary: 'Soft-delete a life event', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/life-events/{id}/restore': {
      parameters: [idParam],
      post: { tags: ['Life Events'], summary: 'Restore a life event', responses: { '200': dataResponse('Restored life event.', { $ref: '#/components/schemas/LifeEvent' }), ...withNotFound } },
    },

    // ─── Notes ───────────────────────────────────────────────────
    '/notes/search': {
      get: {
        tags: ['Notes'],
        summary: 'Search notes',
        parameters: [
          ...paginationParams,
          { name: 'query', in: 'query', schema: { type: 'string' } },
          { name: 'tag_name', in: 'query', schema: { type: 'string' } },
          { name: 'contact_id', in: 'query', schema: { type: 'string' } },
          { name: 'is_pinned', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { '200': listResponse('Matching notes.'), ...commonErrors },
      },
    },
    '/notes': {
      get: {
        tags: ['Notes'],
        summary: 'List a contact’s notes',
        parameters: [contactIdQuery, ...paginationParams],
        responses: { '200': dataResponse('Paginated notes.', { type: 'array', items: { $ref: '#/components/schemas/Note' } }, true), ...withNotFound, '422': { $ref: '#/components/responses/ValidationError' } },
      },
      post: {
        tags: ['Notes'],
        summary: 'Create a note',
        requestBody: jsonBody('#/components/schemas/Note'),
        responses: { '201': dataResponse('Created note.', { $ref: '#/components/schemas/Note' }), ...writeErrors },
      },
    },
    '/notes/{id}': {
      parameters: [idParam],
      get: { tags: ['Notes'], summary: 'Get a note', responses: { '200': dataResponse('Note.', { $ref: '#/components/schemas/Note' }), ...withNotFound } },
      patch: {
        tags: ['Notes'],
        summary: 'Update a note',
        requestBody: jsonBody('#/components/schemas/Note'),
        responses: { '200': dataResponse('Updated note.', { $ref: '#/components/schemas/Note' }), ...writeErrors },
      },
      delete: { tags: ['Notes'], summary: 'Soft-delete a note', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/notes/{id}/restore': {
      parameters: [idParam],
      post: { tags: ['Notes'], summary: 'Restore a note', responses: { '200': dataResponse('Restored note.', { $ref: '#/components/schemas/Note' }), ...withNotFound } },
    },

    // ─── Reminders ───────────────────────────────────────────────
    '/reminders': {
      get: {
        tags: ['Reminders'],
        summary: 'List reminders',
        parameters: [
          ...paginationParams,
          { name: 'contact_id', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': dataResponse('Paginated reminders.', { type: 'array', items: { $ref: '#/components/schemas/Reminder' } }, true), ...commonErrors },
      },
      post: {
        tags: ['Reminders'],
        summary: 'Create a reminder',
        requestBody: jsonBody('#/components/schemas/Reminder'),
        responses: { '201': dataResponse('Created reminder.', { $ref: '#/components/schemas/Reminder' }), ...writeErrors },
      },
    },
    '/reminders/{id}': {
      parameters: [idParam],
      get: { tags: ['Reminders'], summary: 'Get a reminder', responses: { '200': dataResponse('Reminder.', { $ref: '#/components/schemas/Reminder' }), ...withNotFound } },
      patch: {
        tags: ['Reminders'],
        summary: 'Update a reminder',
        requestBody: jsonBody('#/components/schemas/Reminder'),
        responses: { '200': dataResponse('Updated reminder.', { $ref: '#/components/schemas/Reminder' }), ...writeErrors },
      },
      delete: { tags: ['Reminders'], summary: 'Soft-delete a reminder', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/reminders/{id}/restore': {
      parameters: [idParam],
      post: { tags: ['Reminders'], summary: 'Restore a reminder', responses: { '200': objectResponse('Restored reminder.'), ...withNotFound } },
    },
    '/reminders/{id}/complete': {
      parameters: [idParam],
      post: { tags: ['Reminders'], summary: 'Mark a reminder complete', responses: { '200': objectResponse('Completed reminder.'), ...withNotFound } },
    },
    '/reminders/{id}/snooze': {
      parameters: [idParam],
      post: {
        tags: ['Reminders'],
        summary: 'Snooze a reminder',
        requestBody: jsonBody('#/components/schemas/Reminder', true),
        responses: { '200': objectResponse('Snoozed reminder.'), ...writeErrors },
      },
    },
    '/reminders/{id}/dismiss': {
      parameters: [idParam],
      post: { tags: ['Reminders'], summary: 'Dismiss a reminder', responses: { '200': deletedResponse, ...withNotFound } },
    },

    // ─── Timeline ────────────────────────────────────────────────
    '/timeline': {
      get: {
        tags: ['Timeline'],
        summary: 'Get a contact’s unified timeline',
        parameters: [
          contactIdQuery,
          ...paginationParams,
          { name: 'entry_type', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': listResponse('Paginated timeline entries.'), ...withNotFound, '422': { $ref: '#/components/responses/ValidationError' } },
      },
    },

    // ─── Gifts ───────────────────────────────────────────────────
    '/gifts/stats': {
      get: {
        tags: ['Gifts'],
        summary: 'Gift tracker with summary',
        parameters: [
          ...paginationParams,
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['giving', 'receiving'] } },
          { name: 'occasion', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': listResponse('Gift tracker entries with summary meta.'), ...commonErrors },
      },
    },
    '/gifts': {
      get: {
        tags: ['Gifts'],
        summary: 'List gifts',
        parameters: [
          ...paginationParams,
          { name: 'contact_id', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['giving', 'receiving'] } },
        ],
        responses: { '200': dataResponse('Paginated gifts.', { type: 'array', items: { $ref: '#/components/schemas/Gift' } }, true), ...commonErrors },
      },
      post: {
        tags: ['Gifts'],
        summary: 'Create a gift',
        requestBody: jsonBody('#/components/schemas/Gift'),
        responses: { '201': dataResponse('Created gift.', { $ref: '#/components/schemas/Gift' }), ...writeErrors },
      },
    },
    '/gifts/{id}': {
      parameters: [idParam],
      get: { tags: ['Gifts'], summary: 'Get a gift', responses: { '200': dataResponse('Gift.', { $ref: '#/components/schemas/Gift' }), ...withNotFound } },
      patch: {
        tags: ['Gifts'],
        summary: 'Update a gift',
        requestBody: jsonBody('#/components/schemas/Gift'),
        responses: { '200': dataResponse('Updated gift.', { $ref: '#/components/schemas/Gift' }), ...writeErrors },
      },
      delete: { tags: ['Gifts'], summary: 'Soft-delete a gift', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/gifts/{id}/restore': {
      parameters: [idParam],
      post: { tags: ['Gifts'], summary: 'Restore a gift', responses: { '200': dataResponse('Restored gift.', { $ref: '#/components/schemas/Gift' }), ...withNotFound } },
    },

    // ─── Debts ───────────────────────────────────────────────────
    '/debts': {
      get: {
        tags: ['Debts'],
        summary: 'List debts',
        parameters: [
          ...paginationParams,
          { name: 'contact_id', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': dataResponse('Paginated debts.', { type: 'array', items: { $ref: '#/components/schemas/Debt' } }, true), ...commonErrors },
      },
      post: {
        tags: ['Debts'],
        summary: 'Create a debt',
        requestBody: jsonBody('#/components/schemas/Debt'),
        responses: { '201': dataResponse('Created debt.', { $ref: '#/components/schemas/Debt' }), ...writeErrors },
      },
    },
    '/debts/summary': {
      get: {
        tags: ['Debts'],
        summary: 'Debt summary for a contact',
        parameters: [contactIdQuery],
        responses: { '200': objectResponse('Aggregate debt summary.'), ...withNotFound, '422': { $ref: '#/components/responses/ValidationError' } },
      },
    },
    '/debts/{id}': {
      parameters: [idParam],
      get: { tags: ['Debts'], summary: 'Get a debt', responses: { '200': dataResponse('Debt.', { $ref: '#/components/schemas/Debt' }), ...withNotFound } },
      patch: {
        tags: ['Debts'],
        summary: 'Update a debt',
        requestBody: jsonBody('#/components/schemas/Debt'),
        responses: { '200': dataResponse('Updated debt.', { $ref: '#/components/schemas/Debt' }), ...writeErrors },
      },
      delete: { tags: ['Debts'], summary: 'Soft-delete a debt', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/debts/{id}/restore': {
      parameters: [idParam],
      post: { tags: ['Debts'], summary: 'Restore a debt', responses: { '200': dataResponse('Restored debt.', { $ref: '#/components/schemas/Debt' }), ...withNotFound } },
    },
    '/debts/{id}/settle': {
      parameters: [idParam],
      post: { tags: ['Debts'], summary: 'Settle a debt', responses: { '200': dataResponse('Settled debt.', { $ref: '#/components/schemas/Debt' }), ...withNotFound } },
    },

    // ─── Tasks ───────────────────────────────────────────────────
    '/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List tasks',
        parameters: [
          ...paginationParams,
          { name: 'contact_id', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } },
          { name: 'priority', in: 'query', schema: { type: 'string', enum: ['low', 'medium', 'high'] } },
        ],
        responses: { '200': dataResponse('Paginated tasks.', { type: 'array', items: { $ref: '#/components/schemas/Task' } }, true), ...commonErrors },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create a task',
        requestBody: jsonBody('#/components/schemas/Task'),
        responses: { '201': dataResponse('Created task.', { $ref: '#/components/schemas/Task' }), ...withValidation },
      },
    },
    '/tasks/{id}': {
      parameters: [idParam],
      get: { tags: ['Tasks'], summary: 'Get a task', responses: { '200': dataResponse('Task.', { $ref: '#/components/schemas/Task' }), ...withNotFound } },
      patch: {
        tags: ['Tasks'],
        summary: 'Update a task',
        requestBody: jsonBody('#/components/schemas/Task'),
        responses: { '200': dataResponse('Updated task.', { $ref: '#/components/schemas/Task' }), ...writeErrors },
      },
      delete: { tags: ['Tasks'], summary: 'Soft-delete a task', responses: { '200': deletedResponse, ...withNotFound } },
    },
    '/tasks/{id}/restore': {
      parameters: [idParam],
      post: { tags: ['Tasks'], summary: 'Restore a task', responses: { '200': dataResponse('Restored task.', { $ref: '#/components/schemas/Task' }), ...withNotFound } },
    },
    '/tasks/{id}/complete': {
      parameters: [idParam],
      post: { tags: ['Tasks'], summary: 'Mark a task complete', responses: { '200': dataResponse('Completed task.', { $ref: '#/components/schemas/Task' }), ...withNotFound } },
    },

    // ─── Tags ────────────────────────────────────────────────────
    '/tags': {
      get: { tags: ['Tags'], summary: 'List tags', responses: { '200': listResponse('Tags.'), ...commonErrors } },
      post: {
        tags: ['Tags'],
        summary: 'Create a tag',
        requestBody: jsonBody('#/components/schemas/Tag'),
        responses: { '201': dataResponse('Created tag.', { $ref: '#/components/schemas/Tag' }), ...withValidation },
      },
    },
    '/tags/{id}': {
      parameters: [idParam],
      patch: {
        tags: ['Tags'],
        summary: 'Update a tag',
        requestBody: jsonBody('#/components/schemas/Tag'),
        responses: { '200': dataResponse('Updated tag.', { $ref: '#/components/schemas/Tag' }), ...writeErrors },
      },
      delete: { tags: ['Tags'], summary: 'Delete a tag', responses: { '200': deletedResponse, ...withNotFound } },
    },

    // ─── Search ──────────────────────────────────────────────────
    '/search': {
      get: {
        tags: ['Search'],
        summary: 'Global cross-entity search',
        parameters: [
          { name: 'query', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'entity_types', in: 'query', schema: { type: 'string' }, description: 'Comma-separated entity types, e.g. contacts,notes.' },
          { name: 'limit_per_type', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': dataResponse('Search results grouped by entity, with total_matches meta.', { type: 'object' }), ...withValidation },
      },
    },

    // ─── Export ──────────────────────────────────────────────────
    '/export': {
      get: { tags: ['Export'], summary: 'Full data export', responses: { '200': objectResponse('Full JSON export of the user’s CRM data.'), ...commonErrors } },
    },
    '/export/stats': {
      get: { tags: ['Export'], summary: 'Export statistics', responses: { '200': objectResponse('Aggregate statistics.'), ...commonErrors } },
    },
  };
}
