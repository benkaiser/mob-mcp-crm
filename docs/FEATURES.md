# Mob — Feature Specification

> **App Name:** Mob (named after the term for a group of kangaroos 🦘)
> **Version:** 0.1.0 (Draft)
> **Interface:** MCP Server (SSE transport)
> **Storage:** SQLite
> **Runtime:** Node.js / TypeScript
> **Architecture:** AI-first, MCP-native, designed for future web UI compatibility

---

## 1. Overview & Philosophy

**Mob** is an AI-first **Personal Relationship Management (PRM)** tool designed to help you maintain meaningful relationships by keeping track of everything you know about the people in your life. Users interact with Mob entirely through natural language via an AI assistant connected over MCP — there is no traditional GUI. You simply describe what you want to log, look up, or be reminded about, and the AI decides which tools to call.

### Design Principles

- **AI-first:** The interface is natural language. Users speak to an AI assistant; the assistant calls MCP tools. No forms, no buttons, no navigation.
- **Contact-centric:** Every feature revolves around contacts. There are no standalone features unrelated to people.
- **MCP-native:** Built as an MCP server from the ground up, leveraging MCP features like elicitation for guided data entry and OAuth for authentication.
- **Future UI-ready:** The data model and service layer are designed to support a web UI in the future without architectural changes.
- **Local & private:** All data is stored locally in a SQLite database. No external services, no telemetry, no cloud sync.
- **Two operating modes:** Persistent mode (full accounts, permanent storage) and Forgetful mode (ephemeral sessions, no login required).

---

## 2. Contacts

Contacts are the central entity of the entire system. Every other feature is either a property of a contact or describes a relationship/interaction between contacts.

### 2.1 Identity & Basic Information

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `first_name` | string | ✅ | Contact's first/given name |
| `last_name` | string | ❌ | Contact's last/family name |
| `nickname` | string | ❌ | Preferred name or alias |
| `maiden_name` | string | ❌ | Name before marriage (if applicable) |
| `gender` | string | ❌ | Free-text gender identity |
| `pronouns` | string | ❌ | Preferred pronouns (e.g., "he/him", "they/them") |
| `avatar_url` | string | ❌ | URL to a profile photo or avatar |

### 2.2 Birthday Handling

Birthdays are a critical CRM feature with real-world complexity — people don't always know exact dates. The system supports three modes:

| Mode | Fields Stored | Example | Use Case |
|------|--------------|---------|----------|
| **Full date** | Year, month, day | 1990-03-15 | You know the complete birthday |
| **Month & day only** | Month, day (no year) | ??-03-15 | You know when they celebrate but not their birth year |
| **Approximate age** | Estimated birth year | ~1990 | "They're about 35" — system back-calculates an approximate year |

- When a birthday is stored (in any mode), an **automatic yearly reminder** is created.
- Age is calculated dynamically when a year is available (exact or approximate), and clearly labeled as approximate when estimated.

### 2.3 Status

Each contact has a lifecycle status:

| Status | Description |
|--------|-------------|
| `active` | Default. A living, current contact. |
| `archived` | Moved out of active view but data is preserved. Useful for contacts you've lost touch with. |
| `deceased` | Marks the contact as deceased. Optionally stores date of passing. Suppresses birthday reminders. |

### 2.4 Favorite / Starred

Contacts can be **starred/favorited** for quick access. This is a simple boolean flag. Starred contacts surface first in relevant queries and can be filtered on.

### 2.5 How We Met

An optional record of how you first encountered this person:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `met_at_date` | date | ❌ | When you met |
| `met_at_location` | string | ❌ | Where you met (e.g., "Sarah's birthday party", "Conference in Berlin") |
| `met_through_contact_id` | reference | ❌ | Link to another contact who introduced you |
| `met_description` | text | ❌ | Free-text description of the circumstances |

### 2.6 Work Information

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_title` | string | ❌ | Current job title / role |
| `company` | string | ❌ | Company or organization name |
| `industry` | string | ❌ | Industry or field (e.g., "Technology", "Healthcare") |
| `work_notes` | text | ❌ | Additional context about their professional life |

> **Note:** Companies are stored as plain strings rather than separate entities. This keeps the model simple for a personal CRM while still allowing search/filter by company name.

### 2.7 Contact Methods

A contact can have **multiple contact methods** of various types. Each is a separate record linked to the contact.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | enum | ✅ | One of: `email`, `phone`, `whatsapp`, `telegram`, `signal`, `twitter`, `instagram`, `facebook`, `linkedin`, `website`, `other` |
| `value` | string | ✅ | The actual handle, number, URL, or address |
| `label` | string | ❌ | Optional label (e.g., "Personal", "Work", "Mobile") |
| `is_primary` | boolean | ❌ | Whether this is the preferred method for this type (default: false) |

- Multiple entries of the same type are allowed (e.g., two email addresses).
- The `type` list is extensible — new types can be added without schema changes by using the `other` type with a descriptive label.

### 2.8 Addresses

A contact can have **multiple physical addresses**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | ❌ | Type label (e.g., "Home", "Work", "Parents' house") |
| `street_line_1` | string | ❌ | Street address |
| `street_line_2` | string | ❌ | Apartment, suite, unit, etc. |
| `city` | string | ❌ | City / locality |
| `state_province` | string | ❌ | State, province, or region |
| `postal_code` | string | ❌ | ZIP / postal code |
| `country` | string | ❌ | Country name or ISO code |
| `is_primary` | boolean | ❌ | Whether this is the main address (default: false) |

- No individual field is required — partial addresses are valid (e.g., just a city and country).

### 2.9 Food Preferences

A dedicated section for tracking food-related information, which is invaluable for planning meals, gatherings, or gift-giving:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dietary_restrictions` | string[] | ❌ | E.g., "vegetarian", "vegan", "halal", "kosher", "gluten-free" |
| `allergies` | string[] | ❌ | Food allergies (e.g., "peanuts", "shellfish", "dairy") |
| `favorite_foods` | string[] | ❌ | Foods they particularly enjoy |
| `disliked_foods` | string[] | ❌ | Foods they dislike or avoid |
| `notes` | text | ❌ | Additional food-related context (e.g., "Loves spicy food", "Trying keto this year") |

### 2.10 Custom Fields

For any information that doesn't fit the predefined structure, contacts support **custom key-value fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field_name` | string | ✅ | The label / key (e.g., "Favorite color", "T-shirt size") |
| `field_value` | string | ✅ | The value |
| `field_group` | string | ❌ | Optional grouping label (e.g., "Preferences", "Medical") |

---

## 3. Relationships

Relationships describe how contacts are connected to each other. They are a core feature for understanding someone's social context.

### 3.1 Structure

Each relationship is a **link between two contacts** with a defined type. Relationships are stored as **directional pairs** — when you create a relationship, both the forward and inverse records are created automatically.

**Example:** If you set Contact A as the "parent" of Contact B, the system also records Contact B as the "child" of Contact A.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_id` | reference | ✅ | The source contact |
| `related_contact_id` | reference | ✅ | The related contact |
| `relationship_type` | string | ✅ | The type of relationship (see below) |
| `notes` | text | ❌ | Additional context about this relationship |

### 3.2 Relationship Types

Relationship types are organized into categories, each with a defined **inverse type** for automatic bidirectional creation:

#### Love
| Type | Inverse |
|------|---------|
| `significant_other` | `significant_other` |
| `spouse` | `spouse` |
| `date` | `date` |
| `lover` | `lover` |
| `in_love_with` | `in_love_with` |
| `secret_lover` | `secret_lover` |
| `ex_boyfriend_girlfriend` | `ex_boyfriend_girlfriend` |
| `ex_husband_wife` | `ex_husband_wife` |

#### Family
| Type | Inverse |
|------|---------|
| `parent` | `child` |
| `child` | `parent` |
| `sibling` | `sibling` |
| `grandparent` | `grandchild` |
| `grandchild` | `grandparent` |
| `uncle_aunt` | `nephew_niece` |
| `nephew_niece` | `uncle_aunt` |
| `cousin` | `cousin` |
| `godparent` | `godchild` |
| `godchild` | `godparent` |
| `step_parent` | `step_child` |
| `step_child` | `step_parent` |

#### Friend
| Type | Inverse |
|------|---------|
| `friend` | `friend` |
| `best_friend` | `best_friend` |

#### Work
| Type | Inverse |
|------|---------|
| `colleague` | `colleague` |
| `boss` | `subordinate` |
| `subordinate` | `boss` |
| `mentor` | `protege` |
| `protege` | `mentor` |

#### Other
| Type | Inverse |
|------|---------|
| `custom` | `custom` |

- **Custom relationships** use the `custom` type with a descriptive `notes` field to explain the connection.
- Relationship types are defined in a configuration table, making them extensible without code changes.

---

## 4. Notes

Notes are free-text records attached to a contact for capturing anything that doesn't fit elsewhere.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_id` | reference | ✅ | The contact this note belongs to |
| `title` | string | ❌ | Optional title/heading for the note |
| `body` | text | ✅ | The note content (supports markdown) |
| `is_pinned` | boolean | ❌ | Whether this note is pinned to the top of the contact's profile (default: false) |
| `created_at` | datetime | auto | When the note was created |
| `updated_at` | datetime | auto | When the note was last modified |

- A contact can have **unlimited notes**.
- **Pinned notes** appear prominently at the top of a contact's profile, ideal for "always remember this" information.
- Notes are displayed in reverse chronological order by default, with pinned notes first.

---

## 5. Activities & Interactions

This section covers all records of time spent with or communicating with contacts. There are two sub-types that share a common structure:

### 5.1 Common Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | enum | ✅ | The interaction category (see 5.2) |
| `title` | string | ❌ | Short summary (e.g., "Caught up over coffee") |
| `description` | text | ❌ | Detailed notes about the interaction |
| `occurred_at` | datetime | ✅ | When this interaction took place |
| `duration_minutes` | integer | ❌ | How long the interaction lasted |
| `location` | string | ❌ | Where the interaction took place |
| `participant_contact_ids` | reference[] | ✅ | Contacts involved (at least one) |
| `activity_type_id` | reference | ❌ | Link to a custom activity type (see 5.3) |
| `created_at` | datetime | auto | Record creation timestamp |

### 5.2 Interaction Types

| Type | Description | Examples |
|------|-------------|---------|
| `phone_call` | Voice call | Called mom, business call with client |
| `video_call` | Video chat | Zoom catch-up, FaceTime with family |
| `text_message` | Text-based conversation | SMS thread, WhatsApp chat |
| `in_person` | Face-to-face meeting | Lunch, coffee, dinner party |
| `email` | Email exchange | Sent follow-up email |
| `activity` | Shared activity or outing | Went hiking, attended concert, played tennis |
| `other` | Anything else | Custom interaction type |

### 5.3 Custom Activity Types

Users can define custom activity types to categorize interactions more precisely:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name (e.g., "Coffee", "Hiking", "Board games") |
| `category` | string | ❌ | Grouping category (e.g., "Food & Drink", "Sports", "Entertainment") |
| `icon` | string | ❌ | Emoji or icon identifier for future UI use |

**Predefined activity types** (seeded on first run):

| Category | Types |
|----------|-------|
| Food & Drink | Coffee, Lunch, Dinner, Drinks, Brunch |
| Entertainment | Movie, Concert, Theater, Museum, Game night |
| Sports & Outdoors | Hiking, Running, Gym, Cycling, Swimming |
| Social | Party, Wedding, Birthday celebration, Holiday gathering |
| Travel | Trip, Vacation, Day trip |
| General | Hangout, Errand, Favor |

### 5.4 Multi-Contact Interactions

An interaction can involve **multiple contacts** — for example, "Had dinner with Sarah, Tom, and Mike." All participating contacts are linked to the same interaction record, so it appears in each contact's timeline.

---

## 6. Life Events

Life events record significant milestones in a contact's life. They differ from activities in that they describe something that happened *to* the contact, not something you did *with* them.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_id` | reference | ✅ | The contact this event belongs to |
| `event_type` | string | ✅ | The type of life event (see categories below) |
| `title` | string | ✅ | Short description (e.g., "Graduated from MIT") |
| `description` | text | ❌ | Additional details |
| `occurred_at` | date | ❌ | When this event happened (can be approximate) |
| `related_contact_ids` | reference[] | ❌ | Other contacts involved (e.g., spouse in a marriage event) |
| `created_at` | datetime | auto | Record creation timestamp |

### 6.1 Life Event Categories

| Category | Event Types |
|----------|-------------|
| **Education** | Started school, Graduated, Got a degree, Dropped out |
| **Career** | New job, Promotion, Retired, Started a business, Lost job, Career change |
| **Relationships** | Got engaged, Got married, Had a child, Got divorced, Started dating, Broke up |
| **Living** | Moved to a new city, Moved to a new country, Bought a house, Moved in together |
| **Health** | Major illness, Recovery, Surgery |
| **Achievement** | Published work, Won an award, Completed a major goal |
| **Loss** | Death of a loved one, Major setback |
| **Other** | Custom life event |

---

## 7. Reminders

Reminders ensure you never forget important dates, follow-ups, or recurring check-ins related to your contacts.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_id` | reference | ✅ | The contact this reminder is for |
| `title` | string | ✅ | What to remember (e.g., "Send birthday card", "Follow up on job application") |
| `description` | text | ❌ | Additional context |
| `reminder_date` | date | ✅ | The next date this reminder should trigger |
| `frequency` | enum | ✅ | `one_time`, `weekly`, `monthly`, `yearly` |
| `status` | enum | auto | `active`, `snoozed`, `completed`, `dismissed` |
| `is_auto_generated` | boolean | auto | Whether this was system-generated (e.g., birthday reminders) |
| `created_at` | datetime | auto | Record creation timestamp |

### 7.1 Reminder Behavior

- **One-time reminders** move to `completed` status after their date passes.
- **Recurring reminders** automatically advance `reminder_date` to the next occurrence after being acknowledged.
- **Birthday reminders** are auto-generated when a birthday is set (with month and day). They are yearly reminders. If a birthday is removed, the auto-generated reminder is also removed.
- **Snoozed reminders** can be postponed to a later date.
- **MCP tool queries** can surface upcoming reminders (e.g., "reminders in the next 7 days") to help the AI assistant proactively inform the user.

### 7.2 Reminder Notifications

Since this is an MCP server (no push notification infrastructure), reminders are **passive** — they are surfaced when queried. The MCP tooling should support:

- Listing overdue reminders
- Listing upcoming reminders within a time window
- Marking reminders as completed or snoozed

> **Future enhancement:** A scheduled background job could send notifications via email or system notifications.

---

## 8. Gifts

Track gift ideas, planned gifts, and gifts exchanged with contacts.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_id` | reference | ✅ | The contact this gift is for/from |
| `name` | string | ✅ | What the gift is (e.g., "Kindle Paperwhite") |
| `description` | text | ❌ | Additional details about the gift |
| `url` | string | ❌ | Link to the product or store |
| `estimated_cost` | decimal | ❌ | Price or estimated value |
| `currency` | string | ❌ | Currency code (default: USD) |
| `occasion` | string | ❌ | What the gift is for (e.g., "Birthday 2025", "Christmas", "Just because") |
| `status` | enum | ✅ | `idea`, `planned`, `purchased`, `given`, `received` |
| `date` | date | ❌ | When the gift was given/received |
| `direction` | enum | ✅ | `giving` (you → them) or `receiving` (them → you) |
| `created_at` | datetime | auto | Record creation timestamp |

### 8.1 Gift Workflow

1. **Idea** — "This would be a great gift for Sarah someday"
2. **Planned** — "I'm going to get this for her birthday"
3. **Purchased** — "I bought it"
4. **Given / Received** — "The gift was exchanged"

This workflow supports a **wishlist/idea bank** where you can collect gift ideas year-round and convert them to planned gifts when an occasion arises.

---

## 9. Debts

Track money owed to or from contacts.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_id` | reference | ✅ | The contact involved in the debt |
| `amount` | decimal | ✅ | The amount of money |
| `currency` | string | ❌ | Currency code (default: USD) |
| `direction` | enum | ✅ | `i_owe_them` or `they_owe_me` |
| `reason` | string | ❌ | Why the debt exists (e.g., "Split dinner", "Borrowed for concert tickets") |
| `incurred_at` | date | ❌ | When the debt was created |
| `settled_at` | date | ❌ | When the debt was settled (null if still active) |
| `status` | enum | auto | `active` or `settled` |
| `created_at` | datetime | auto | Record creation timestamp |

### 9.1 Debt Summary

The system should support a **per-contact debt summary** that calculates the net balance: total you owe them minus total they owe you, across all active debts.

---

## 10. Tasks

To-do items that can optionally be linked to a specific contact.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_id` | reference | ❌ | Optionally linked to a contact |
| `title` | string | ✅ | What needs to be done |
| `description` | text | ❌ | Additional details |
| `due_date` | date | ❌ | When this should be done by |
| `priority` | enum | ❌ | `low`, `medium`, `high` (default: `medium`) |
| `status` | enum | auto | `pending`, `in_progress`, `completed` |
| `completed_at` | datetime | ❌ | When the task was completed |
| `created_at` | datetime | auto | Record creation timestamp |

---

## 11. Tags & Groups

### 11.1 Tags

Tags are lightweight labels for flexible contact organization.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Tag name (e.g., "family", "coworker", "berlin", "close-friend") |
| `color` | string | ❌ | Hex color code for future UI display |

- A contact can have **multiple tags**.
- Tags are created on-the-fly when first used.
- Tags support filtering and search (e.g., "show me all contacts tagged 'berlin'").

### 11.2 Groups

Groups are named collections of contacts, representing real-world social circles.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Group name (e.g., "Book Club", "College Friends", "Soccer Team") |
| `description` | text | ❌ | Description of the group |

- A contact can belong to **multiple groups**.
- Groups differ from tags in that they represent **real-world social units** with a meaningful identity, whereas tags are purely organizational labels.

---

## 12. Contact Timeline

Every contact has a **chronological timeline** that aggregates all related records into a single, unified history. This is not a separate entity but a **computed view** across existing data.

### 12.1 Timeline Entry Sources

The timeline pulls from:

| Source | Example Entry |
|--------|--------------|
| Activities & Interactions | "Had coffee with Sarah — Mar 15, 2025" |
| Life Events | "Sarah graduated from MIT — Jun 1, 2024" |
| Notes | "Note added: Her daughter started kindergarten — Sep 5, 2025" |
| Reminders triggered | "Birthday reminder — Mar 15, 2025" |
| Gifts | "Gave Sarah a book for her birthday — Mar 15, 2025" |
| Debts | "Sarah owes $25 for concert tickets — Apr 2, 2025" |
| Relationship changes | "Added as friend — Jan 10, 2024" |
| Contact created | "Contact created — Jan 10, 2024" |

### 12.2 Timeline Behavior

- Entries are sorted in **reverse chronological order** (newest first).
- Supports **pagination** for contacts with extensive histories.
- Can be **filtered by entry type** (e.g., show only activities, or only life events).

---

## 13. Search & Filtering

The system must support powerful search and filtering to make it easy to find the right contacts and information.

### 13.1 Contact Search

- **Full-text search** across: name, nickname, company, notes body, custom field values, tags, group names
- **Search results** return contacts with a snippet showing why they matched

### 13.2 Contact Filtering

| Filter | Description |
|--------|-------------|
| By tag | Contacts with a specific tag |
| By group | Contacts in a specific group |
| By company | Contacts at a specific company |
| By location | Contacts in a specific city, state, or country |
| By relationship | "Show me Sarah's family" |
| By status | Active, archived, deceased |
| By favorite | Starred contacts only |
| By upcoming birthday | Birthdays in the next N days |
| By last interaction | Contacts you haven't interacted with in N days |
| By reminder | Contacts with upcoming or overdue reminders |

### 13.3 Sorting

| Sort Option | Description |
|-------------|-------------|
| Name (A-Z / Z-A) | Alphabetical by last name, then first name |
| Last interaction | Most/least recently interacted with |
| Date added | When the contact was created |
| Upcoming birthday | Next birthday soonest first |

---

## 14. Data Management

### 14.1 Audit Trail

All entities track `created_at` and `updated_at` timestamps. The contact timeline (Section 12) serves as a human-readable audit trail.

### 14.2 Data Export

The system should support full data export in JSON format, enabling:

- Backup and restore
- Migration to other systems
- Data portability

### 14.3 Soft Deletes

All primary entities (contacts, notes, activities, etc.) use **soft deletes** — records are marked as deleted with a `deleted_at` timestamp rather than being permanently removed. This prevents accidental data loss and supports future "undo" or "trash" functionality.

---

## 15. Authentication & Operating Modes

Mob supports two distinct operating modes, configured at server startup.

### 15.1 Persistent Mode (Default)

Full-featured mode with user accounts and permanent data storage.

#### Account Creation

Users must create an account before accessing the CRM:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | User's display name |
| `email` | string | ✅ | Email address (used as login identifier) |
| `password` | string | ✅ | Password (hashed with bcrypt before storage) |
| `created_at` | datetime | auto | Account creation timestamp |

- No email verification or password reset emails are sent (out of scope for v1).
- A user's CRM data is fully isolated to their account.

#### OAuth Flow (MCP OAuth with PKCE)

Authentication uses the **MCP OAuth specification** with the **PKCE (Proof Key for Code Exchange)** flow:

1. MCP client initiates OAuth authorization request with PKCE `code_verifier` and `code_challenge`.
2. Server accepts **any `client_id`** — there is no client registration. This makes it easy for any MCP client to connect.
3. Server logs every authorization for audit purposes (see 15.3).
4. On first connection, user is prompted to log in or create an account.
5. Server issues access token tied to the user's account.
6. All subsequent MCP tool calls are authenticated via the access token and scoped to that user's data.

#### Authorization Log

Every OAuth authorization is recorded:

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | reference | The authenticated user |
| `client_id` | string | The `client_id` provided by the MCP client |
| `ip_address` | string | Client IP address |
| `user_agent` | string | Client user agent string |
| `authorized_at` | datetime | When the authorization occurred |
| `last_used_at` | datetime | Last time this token was used |

### 15.2 Forgetful Mode

An ephemeral mode for demos, testing, or privacy-sensitive usage. Enabled via server startup flag (e.g., `--forgetful`).

#### Behavior

- **No login required.** OAuth flow still runs (for MCP protocol compliance) but no credentials are requested — the server issues a token tied to a session ID.
- **Ephemeral storage.** Each session gets its own isolated SQLite database (in-memory or temp file).
- **Automatic data destruction.** All session data is permanently deleted when either:
  - The MCP session disconnects, **or**
  - 2 hours elapse since session creation (whichever comes first)
- **No account creation.** The session ID is the only identifier.
- **Full feature parity.** All CRM tools work identically — the user experience is the same, data just doesn't persist.

#### Use Cases

- Live demos ("try it without signing up")
- Privacy-conscious users who want zero data retention
- Testing and development

### 15.3 Session Notifications on Connect

When a user establishes an MCP session (in either mode), the server checks for and delivers any pending notifications:

- **Overdue reminders** — reminders whose date has passed since the last session
- **Today's reminders** — reminders due today
- **Upcoming birthdays** — birthdays in the next 7 days
- **Custom notifications** — any queued notifications from background processes

These are delivered as MCP notifications immediately after session establishment, giving the AI assistant context to proactively inform the user.

---

## 16. Notification System

Notifications are records of events the user should be aware of. Since Mob is an MCP server (no push notification infrastructure), notifications are **stored and delivered on session connect** (see 15.3).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | reference | ✅ | The user this notification is for |
| `type` | enum | ✅ | `birthday`, `reminder`, `follow_up`, `custom` |
| `title` | string | ✅ | Short notification title |
| `body` | text | ❌ | Notification details |
| `contact_id` | reference | ❌ | Related contact (if applicable) |
| `source_type` | string | ❌ | The entity type that generated this notification (e.g., "reminder", "birthday") |
| `source_id` | string | ❌ | The ID of the source entity |
| `is_read` | boolean | auto | Whether the user has seen this notification (default: false) |
| `created_at` | datetime | auto | When the notification was generated |
| `read_at` | datetime | ❌ | When the user acknowledged the notification |

### 16.1 Notification Generation

Notifications are generated by:

| Source | Trigger | Example |
|--------|---------|---------|
| Birthday reminders | A contact's birthday is within 7 days | "Sarah's birthday is in 3 days (March 15)" |
| Reminders | A reminder's date arrives | "Follow up with Tom about the job referral" |
| Inactivity detection | No interaction logged with a contact in N days (user-configurable) | "You haven't talked to Mike in 30 days" |
| Custom | User creates a notification manually | "Remember to ask about Lisa's new house" |

### 16.2 MCP Tools for Notifications

| Tool | Description |
|------|-------------|
| `notification_list` | List all notifications (filterable: unread, by type, by contact) |
| `notification_read` | Mark a notification as read |
| `notification_read_all` | Mark all notifications as read |
| `notification_create` | Create a custom notification |

---

## 17. MCP Elicitation

Mob uses **MCP elicitation** to guide users through structured data entry when the AI assistant needs additional information. Instead of the AI guessing or asking multiple follow-up questions, it can trigger an elicitation request that presents the user with a structured form in their MCP client.

### 17.1 When Elicitation Is Used

| Scenario | What's Elicited | Pre-filled Data |
|----------|----------------|-----------------|
| **Creating a contact** | Full contact form (name, birthday, contact methods, work info, etc.) | Any details mentioned in the user's natural language request |
| **Adding a relationship** | Relationship type picker, related contact selector | Contact names mentioned by the user |
| **Recording an activity** | Activity type, date, participants, description, location | Details from the user's message |
| **Creating a reminder** | Title, date, frequency, contact | Parsed date and contact from conversation |
| **Adding an address** | Full address form | Any address components mentioned |
| **Creating a life event** | Event type, date, description, related contacts | Details from the user's message |
| **Adding a gift** | Gift details form (name, url, cost, occasion, status) | Details from the user's message |

### 17.2 Elicitation Behavior

- **Pre-filling:** The AI parses the user's natural language input and pre-fills as many fields as possible. The elicitation form shows these pre-filled values for the user to confirm or modify.
- **Optional fields:** The elicitation form clearly marks required vs. optional fields. Users can skip optional fields.
- **Progressive disclosure:** For complex entities (like contacts), the elicitation form can be split into sections — basic info first, then optional sections the user can expand.
- **Graceful degradation:** If the MCP client does not support elicitation, the AI assistant falls back to conversational data collection (asking follow-up questions in chat).

---

## 18. MCP Tool Design

Each feature area maps to a set of MCP tools following consistent patterns. The AI assistant uses these tools to interact with the CRM data.

### 18.1 Tool Naming Convention

Tools follow the pattern: `{entity}_{action}`

**Actions:** `list`, `get`, `create`, `update`, `delete`, `search`

### 18.2 Tool Inventory

| Tool | Description |
|------|-------------|
| **Contacts** | |
| `contact_list` | List contacts with optional filters (tag, group, status, favorite, etc.) |
| `contact_get` | Get full contact details including all sub-entities |
| `contact_create` | Create a new contact with basic info |
| `contact_update` | Update contact fields |
| `contact_delete` | Soft-delete a contact |
| `contact_search` | Full-text search across contacts |
| `contact_timeline` | Get the unified timeline for a contact |
| **Contact Methods** | |
| `contact_method_add` | Add an email, phone, social handle, etc. |
| `contact_method_update` | Update a contact method |
| `contact_method_remove` | Remove a contact method |
| **Addresses** | |
| `address_add` | Add an address to a contact |
| `address_update` | Update an address |
| `address_remove` | Remove an address |
| **Relationships** | |
| `relationship_add` | Create a relationship between two contacts |
| `relationship_update` | Update relationship type or notes |
| `relationship_remove` | Remove a relationship (removes both directions) |
| `relationship_list` | List all relationships for a contact |
| **Notes** | |
| `note_list` | List notes for a contact |
| `note_create` | Add a note to a contact |
| `note_update` | Update a note |
| `note_delete` | Soft-delete a note |
| **Activities & Interactions** | |
| `activity_list` | List activities/interactions, optionally filtered by contact or type |
| `activity_get` | Get full activity details |
| `activity_create` | Record a new interaction |
| `activity_update` | Update an activity record |
| `activity_delete` | Soft-delete an activity |
| `activity_type_list` | List available activity types |
| `activity_type_create` | Create a custom activity type |
| **Life Events** | |
| `life_event_list` | List life events for a contact |
| `life_event_create` | Record a new life event |
| `life_event_update` | Update a life event |
| `life_event_delete` | Soft-delete a life event |
| **Reminders** | |
| `reminder_list` | List reminders (supports filtering: upcoming, overdue, by contact) |
| `reminder_create` | Create a new reminder |
| `reminder_update` | Update a reminder |
| `reminder_complete` | Mark a reminder as completed |
| `reminder_snooze` | Snooze a reminder to a later date |
| `reminder_delete` | Soft-delete a reminder |
| **Gifts** | |
| `gift_list` | List gifts for a contact |
| `gift_create` | Record a new gift |
| `gift_update` | Update a gift record |
| `gift_delete` | Soft-delete a gift |
| **Debts** | |
| `debt_list` | List debts for a contact |
| `debt_create` | Record a new debt |
| `debt_update` | Update a debt |
| `debt_settle` | Mark a debt as settled |
| `debt_delete` | Soft-delete a debt |
| `debt_summary` | Get net balance summary for a contact |
| **Tasks** | |
| `task_list` | List tasks, optionally filtered by contact or status |
| `task_create` | Create a new task |
| `task_update` | Update a task |
| `task_complete` | Mark a task as completed |
| `task_delete` | Soft-delete a task |
| **Tags** | |
| `tag_list` | List all tags |
| `tag_create` | Create a new tag |
| `tag_update` | Update a tag |
| `tag_delete` | Delete a tag |
| `contact_tag` | Add a tag to a contact |
| `contact_untag` | Remove a tag from a contact |
| **Groups** | |
| `group_list` | List all groups |
| `group_get` | Get group details with member list |
| `group_create` | Create a new group |
| `group_update` | Update a group |
| `group_delete` | Delete a group |
| `group_add_member` | Add a contact to a group |
| `group_remove_member` | Remove a contact from a group |
| **Notifications** | |
| `notification_list` | List notifications (filterable: unread, by type, by contact) |
| `notification_read` | Mark a notification as read |
| `notification_read_all` | Mark all notifications as read |
| `notification_create` | Create a custom notification |
| **Data Management** | |
| `data_export` | Export all data as JSON |
| `data_statistics` | Get CRM statistics (total contacts, interactions, etc.) |

### 18.3 Tool Response Patterns

All tools return consistent response structures:

- **List operations** return paginated results with `{ data: [...], total: number, page: number, per_page: number }`.
- **Get operations** return the full entity with all nested/related data.
- **Create/Update operations** return the created/updated entity.
- **Delete operations** return a success confirmation.
- **Error responses** include a clear error message and error code.

---

## 19. Homepage

The server hosts a simple **static homepage** at its root URL (`/`) that serves as a landing page and connection guide.

### 19.1 Content

The homepage includes:

1. **App name and tagline:** "Mob — An AI-first Personal CRM" with a brief explanation that "Mob" is the name for a group of kangaroos 🦘.
2. **What it is:** A short description explaining that Mob is a personal CRM you interact with entirely through natural language via an AI assistant. No forms, no dashboards — just talk about your relationships and Mob keeps track.
3. **How to connect:** Clear instructions showing:
   - The MCP server URL and transport type (SSE)
   - OAuth connection details
   - Step-by-step guide for connecting an MCP client
4. **Recommended client:** Link to [Joey MCP Client](https://github.com/benkaiser/joey-mcp-client) as the recommended MCP client for connecting to Mob.
5. **Example interactions:** A few example natural language prompts to demonstrate what the user can do:
   - "Add a new contact: Sarah Chen, she works at Google as a senior engineer"
   - "When is Tom's birthday?"
   - "Log that I had coffee with Mike yesterday at Blue Bottle"
   - "Remind me to call Lisa next Tuesday"
   - "Who haven't I talked to in a while?"

### 19.2 Technical Details

- Served as static HTML/CSS (no JavaScript framework needed).
- Clean, minimal design with good typography.
- Mobile-responsive.
- No authentication required to view the homepage.

---

## 20. Testing Strategy

Every feature and MCP tool endpoint must have comprehensive tests that can be run **without starting the MCP server**. Tests validate the application logic directly against the service layer and database.

### 20.1 Test Structure

```
tests/
├── unit/                    # Pure function tests (validators, formatters, helpers)
│   ├── birthday.test.ts     # Birthday mode parsing and age calculation
│   ├── relationships.test.ts # Inverse relationship type resolution
│   └── ...
├── integration/             # Service layer + database tests
│   ├── contacts.test.ts     # Full CRUD for contacts
│   ├── relationships.test.ts # Bidirectional creation/deletion
│   ├── activities.test.ts   # Activities with multi-contact participants
│   ├── reminders.test.ts    # Reminder scheduling, recurrence, auto-birthday
│   ├── notifications.test.ts # Notification generation and delivery
│   ├── gifts.test.ts        # Gift lifecycle workflow
│   ├── debts.test.ts        # Debt tracking and net balance calculation
│   ├── tasks.test.ts        # Task CRUD and status transitions
│   ├── tags.test.ts         # Tag CRUD and contact tagging
│   ├── groups.test.ts       # Group CRUD and membership
│   ├── search.test.ts       # Full-text search and filtering
│   ├── timeline.test.ts     # Timeline aggregation across entity types
│   ├── auth.test.ts         # Account creation, OAuth flow, token validation
│   └── forgetful.test.ts    # Ephemeral session lifecycle and cleanup
├── e2e/                     # End-to-end MCP protocol tests
│   ├── tool-calls.test.ts   # Validate each MCP tool via protocol
│   ├── elicitation.test.ts  # Elicitation flow testing
│   └── session.test.ts      # Session establishment and notification delivery
└── fixtures/                # Shared test data and helpers
    ├── seed-data.ts         # Reusable test contacts, relationships, etc.
    └── test-helpers.ts      # DB setup/teardown, auth helpers
```

### 20.2 Test Requirements

- **Every MCP tool** has at least one test covering the happy path and one covering error cases (invalid input, not found, unauthorized).
- **Every entity's CRUD** operations are tested: create, read, update, soft-delete, and list with pagination.
- **Business logic** tests cover:
  - Birthday mode parsing and age calculation
  - Bidirectional relationship creation and cascading deletion
  - Reminder recurrence advancement
  - Notification generation from reminders and birthdays
  - Debt net balance calculation
  - Gift status workflow transitions
  - Full-text search accuracy
  - Forgetful mode session expiry and data destruction
  - OAuth PKCE flow validation
- **Database isolation:** Each test suite creates a fresh in-memory SQLite database, ensuring tests are independent and parallelizable.
- **No network dependencies:** Tests run entirely locally with no external service calls.

### 20.3 Test Tooling

- **Test framework:** Vitest (fast, TypeScript-native, compatible with Node.js)
- **Assertions:** Vitest built-in `expect` API
- **Database:** In-memory SQLite instances per test suite
- **Coverage target:** ≥90% line coverage for service layer, ≥80% overall

---

## Appendix A: Future Considerations

The following features are explicitly **out of scope** for the initial version but should be considered for future iterations:

| Feature | Description |
|---------|-------------|
| **Photo/document storage** | File attachments on contacts or activities |
| **Journal** | Standalone diary entries not tied to a contact |
| **Import from Monica** | Migration tool from Monica CRM's export format |
| **Import from contacts** | Import from vCard, Google Contacts, etc. |
| **Web UI** | Browser-based interface alongside MCP |
| **Multi-user** | Shared CRM for families or teams |
| **Push notifications** | Proactive reminder delivery via email/OS notifications |
| **Calendar integration** | Sync reminders and birthdays to external calendars |
| **Contact merging** | Deduplicate and merge contact records |
| **Bulk operations** | Batch tag, group, update, or delete contacts |
| **Email verification** | Email verification on account creation |
| **Password reset** | Email-based password reset flow |
