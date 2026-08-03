# Using Mob

<p class="lead">Mob is contact-centric: almost everything you store belongs to a person, appears in their profile, and contributes to their timeline or relationship context.</p>

## Contacts and profiles

Contacts are the core records in Mob. A profile can include:

| Area | Fields and behavior |
|---|---|
| Identity | First name, last name, nickname, maiden name, pronouns, gender, avatar URL. |
| Birthday | `full_date`, `month_day`, or `approximate_age`; birthday reminders are generated when month/day is known. |
| Status | `active`, `archived`, or `deceased`; deceased contacts suppress birthday reminders. |
| Favorite | Star a contact to prioritize them in lists and filters. |
| How you met | Date, location, the contact who introduced you, and a free-text story. |
| Work | Company, job title, industry, and work notes. Companies are plain text, not separate entities. |

## Contact methods

A contact can have multiple ways to reach them. Types are `email`, `phone`, `whatsapp`, `telegram`, `signal`, `twitter`, `instagram`, `facebook`, `linkedin`, `website`, and `other`. Each method stores a value, optional label, and primary flag.

## Addresses

Addresses are partial-friendly. Store any combination of label, street lines, city, state/province, postal code, country, and primary flag.

## Food preferences

Food preferences track dietary restrictions, allergies, favorite foods, disliked foods, and notes. They are useful for meals, hosting, and gift planning.

## Custom fields

Custom fields are per-contact key/value details with an optional group. Use them for things that do not fit the built-in schema, such as clothing sizes, pet names, or preferences.

## Tags

Tags are user-managed labels used for filtering and organization. In the web app they are managed from **Settings** and assigned on contact profiles. Tags currently store names only; there is no tag color field.

## Relationships

Relationships connect two contacts and automatically maintain inverse records. Canonical types include:

| Category | Types and inverses |
|---|---|
| Love | `significant_other`, `spouse`, `date`, `lover`, `in_love_with`, `secret_lover`, `ex_boyfriend_girlfriend`, `ex_husband_wife` are self-inverse. |
| Family | `parent` ⇄ `child`, `grandparent` ⇄ `grandchild`, `uncle_aunt` ⇄ `nephew_niece`, `godparent` ⇄ `godchild`, `step_parent` ⇄ `step_child`; `sibling` and `cousin` are self-inverse. |
| Friend | `friend`, `best_friend` are self-inverse. |
| Work | `colleague` is self-inverse; `boss` ⇄ `subordinate`; `mentor` ⇄ `protege`. |
| Other | `custom` is self-inverse; custom relationship types can also be managed in Settings. |

## Notes

Notes are markdown-capable text attached to a contact. They can have an optional title and can be pinned so important details stay prominent.

## Activities and the Activity Log

Activities record interactions with one or more contacts. Interaction types are `phone_call`, `video_call`, `text_message`, `in_person`, `email`, `activity`, and `other`. Activities can include a title, description, date/time, duration, location, participants, and optional custom activity type. The Activity Log shows recent interactions across contacts.

## Life events

Life events are milestones that happened to a contact, such as education, career changes, relationships, living changes, health events, achievements, loss, or custom events. They store contact, event type, title, optional description, approximate/known date, and related contacts.

## Reminders

Reminders belong to contacts and store a title, optional description, date, frequency, and status.

| Field | Values |
|---|---|
| Frequency | `one_time`, `weekly`, `monthly`, `yearly` |
| Status | `active`, `snoozed`, `completed`, `dismissed` |

Recurring reminders advance when completed. Reminders can be completed, snoozed, dismissed, deleted, and restored.

## Tasks

Tasks are to-dos that may link to a contact. They include title, description, due date, priority (`low`, `medium`, `high`), status (`pending`, `in_progress`, `completed`), completion timestamp, and soft-delete state.

## Debts

Debts track money owed between you and a contact. They store amount, currency, direction (`i_owe_them` or `they_owe_me`), reason, incurred date, settled date, and status (`active` or `settled`). Mob can show a per-contact net balance.

## Gifts

Gifts track ideas and exchanges. Direction is `giving` or `receiving`; status is `idea`, `planned`, `purchased`, `given`, or `received`. Gifts can also include description, URL, estimated cost, currency, occasion, and date.

## Search, favorites, and dashboard streak

Global search finds contacts and related records. Favorites use the star flag for faster filtering. The dashboard summarizes upcoming reminders, birthdays, stats, and a streak based on recent logged activity so you can see relationship-care momentum.

## Import and export

Mob can import Monica exports, Google Contacts CSV, and vCard files from the web app. Data export produces a portable JSON backup of contacts and related CRM data.
