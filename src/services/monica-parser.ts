/**
 * Parser for Monica CRM SQL export files.
 * Extracts INSERT statements and converts them into structured data objects.
 */

// ─── Parsed Monica Types ────────────────────────────────────────

export interface MonicaContact {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  nickname: string | null;
  gender_id: number | null;
  description: string | null;
  is_starred: number;
  is_partial: number;
  is_active: number;
  is_dead: number;
  first_met_where: string | null;
  first_met_additional_info: string | null;
  job: string | null;
  company: string | null;
  food_preferences: string | null;
  birthday_special_date_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MonicaContactField {
  id: number;
  contact_id: number;
  contact_field_type_id: number;
  data: string;
}

export interface MonicaContactFieldType {
  id: number;
  name: string;
  type: string | null;
}

export interface MonicaTag {
  id: number;
  name: string;
  name_slug: string | null;
}

export interface MonicaContactTag {
  contact_id: number;
  tag_id: number;
}

export interface MonicaNote {
  id: number;
  contact_id: number;
  body: string;
  is_favorited: number;
}

export interface MonicaActivity {
  id: number;
  activity_type_id: number | null;
  summary: string | null;
  description: string | null;
  happened_at: string | null;
  created_at: string | null;
}

export interface MonicaActivityContact {
  activity_id: number;
  contact_id: number;
}

export interface MonicaSpecialDate {
  id: number;
  contact_id: number;
  is_age_based: number;
  is_year_unknown: number;
  date: string | null;
}

export interface MonicaRelationship {
  id: number;
  relationship_type_id: number;
  contact_is: number;
  of_contact: number;
}

export interface MonicaRelationshipType {
  id: number;
  name: string;
  name_reverse_relationship: string;
  relationship_type_group_id: number;
}

export interface MonicaAddress {
  id: number;
  place_id: number;
  contact_id: number;
  name: string | null;
}

export interface MonicaPlace {
  id: number;
  street: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface MonicaLifeEvent {
  id: number;
  contact_id: number;
  life_event_type_id: number;
  name: string | null;
  note: string | null;
  happened_at: string | null;
}

export interface MonicaLifeEventType {
  id: number;
  life_event_category_id: number;
  name: string | null;
  default_life_event_type_key: string | null;
}

export interface MonicaLifeEventCategory {
  id: number;
  name: string | null;
  default_life_event_category_key: string | null;
}

export interface MonicaGift {
  id: number;
  contact_id: number;
  name: string;
  comment: string | null;
  url: string | null;
  amount: number;
  status: string;
  date: string | null;
}

export interface MonicaReminder {
  id: number;
  contact_id: number;
  initial_date: string;
  title: string;
  description: string | null;
  frequency_type: string;
  frequency_number: number;
}

export interface MonicaGender {
  id: number;
  name: string;
  type: string;
}

export interface MonicaCall {
  id: number;
  contact_id: number;
  called_at: string;
  content: string | null;
  contact_called: number;
}

export interface MonicaEntry {
  id: number;
  title: string | null;
  post: string;
  created_at: string | null;
}

export interface MonicaParsedData {
  contacts: MonicaContact[];
  contactFields: MonicaContactField[];
  contactFieldTypes: MonicaContactFieldType[];
  tags: MonicaTag[];
  contactTags: MonicaContactTag[];
  notes: MonicaNote[];
  activities: MonicaActivity[];
  activityContacts: MonicaActivityContact[];
  specialDates: MonicaSpecialDate[];
  relationships: MonicaRelationship[];
  relationshipTypes: MonicaRelationshipType[];
  addresses: MonicaAddress[];
  places: MonicaPlace[];
  lifeEvents: MonicaLifeEvent[];
  lifeEventTypes: MonicaLifeEventType[];
  lifeEventCategories: MonicaLifeEventCategory[];
  gifts: MonicaGift[];
  reminders: MonicaReminder[];
  genders: MonicaGender[];
  calls: MonicaCall[];
  entries: MonicaEntry[];
}

// ─── SQL Parsing ────────────────────────────────────────────────

/**
 * Parse a value from a SQL INSERT statement.
 * Handles: NULL, quoted strings (with escapes), and numbers.
 */
function parseSqlValue(raw: string): string | number | null {
  if (raw === 'NULL') return null;

  // Quoted string
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t');
  }

  // Number
  const num = Number(raw);
  if (!isNaN(num)) return num;

  return raw;
}

/**
 * Tokenize a VALUES row like `(1,'hello','it''s',NULL,42)`.
 * Handles:
 *  - MySQL-style escapes  \'
 *  - Standard SQL doubled single quotes  ''
 *  - Nested parentheses (ignored inside strings)
 */
function tokenizeRow(row: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = row.length;

  // Skip leading '('
  if (row[0] === '(') i = 1;
  // Remove trailing ')' from consideration
  const end = row[row.length - 1] === ')' ? len - 1 : len;

  while (i < end) {
    // Skip whitespace
    while (i < end && (row[i] === ' ' || row[i] === '\t' || row[i] === '\n' || row[i] === '\r')) i++;
    if (i >= end) break;

    if (row[i] === ',') {
      i++;
      continue;
    }

    if (row[i] === "'") {
      // Quoted string — find matching end quote
      let val = "'";
      i++;
      while (i < end) {
        if (row[i] === '\\' && i + 1 < end) {
          // Backslash escape
          val += row[i] + row[i + 1];
          i += 2;
        } else if (row[i] === "'" && i + 1 < end && row[i + 1] === "'") {
          // Doubled single quote
          val += "\\'";
          i += 2;
        } else if (row[i] === "'") {
          val += "'";
          i++;
          break;
        } else {
          val += row[i];
          i++;
        }
      }
      tokens.push(val);
    } else {
      // Unquoted value (NULL, number, etc.)
      let val = '';
      while (i < end && row[i] !== ',' && row[i] !== ')') {
        val += row[i];
        i++;
      }
      tokens.push(val.trim());
    }
  }

  return tokens;
}

/**
 * Split a full INSERT statement's VALUES clause into individual rows.
 * e.g. `(1,'a'),(2,'b')` → [`(1,'a')`, `(2,'b')`]
 */
function splitValueRows(valuesStr: string): string[] {
  const rows: string[] = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    // Find start of row
    while (i < len && valuesStr[i] !== '(') i++;
    if (i >= len) break;

    let depth = 0;
    const start = i;
    let inString = false;

    while (i < len) {
      const ch = valuesStr[i];

      if (inString) {
        if (ch === '\\' && i + 1 < len) {
          i += 2;
          continue;
        }
        if (ch === "'" && i + 1 < len && valuesStr[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (ch === "'") {
          inString = false;
        }
        i++;
        continue;
      }

      if (ch === "'") {
        inString = true;
        i++;
        continue;
      }

      if (ch === '(') {
        depth++;
        i++;
        continue;
      }

      if (ch === ')') {
        depth--;
        if (depth === 0) {
          rows.push(valuesStr.slice(start, i + 1));
          i++;
          break;
        }
        i++;
        continue;
      }

      i++;
    }
  }

  return rows;
}

/**
 * Find all INSERT statements for a given table and parse their rows.
 * Returns an array of objects keyed by column name.
 */
function parseInserts(sql: string, tableName: string): Record<string, any>[] {
  const results: Record<string, any>[] = [];

  // Split into statements. We use a regex to find INSERT INTO `tableName` blocks.
  // The SQL may have multi-line INSERT statements.
  const pattern = new RegExp(
    `INSERT\\s+IGNORE\\s+INTO\\s+\`${tableName}\`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?)(?=;\\s*(?:INSERT|SET|--|$)|$)`,
    'gi'
  );

  let match;
  while ((match = pattern.exec(sql)) !== null) {
    const columns = match[1].split(',').map(c => c.replace(/`/g, '').trim());
    const valuesBlock = match[2];
    const rows = splitValueRows(valuesBlock);

    for (const row of rows) {
      const tokens = tokenizeRow(row);
      const obj: Record<string, any> = {};

      for (let i = 0; i < columns.length && i < tokens.length; i++) {
        obj[columns[i]] = parseSqlValue(tokens[i]);
      }

      results.push(obj);
    }
  }

  return results;
}

// ─── Main Parser ────────────────────────────────────────────────

/**
 * Parse a Monica CRM SQL export into structured data.
 */
export function parseMonicaExport(sql: string): MonicaParsedData {
  const contacts = parseInserts(sql, 'contacts').map(row => ({
    id: row.id as number,
    first_name: (row.first_name ?? '') as string,
    middle_name: row.middle_name as string | null,
    last_name: row.last_name as string | null,
    nickname: row.nickname as string | null,
    gender_id: row.gender_id as number | null,
    description: row.description as string | null,
    is_starred: (row.is_starred ?? 0) as number,
    is_partial: (row.is_partial ?? 0) as number,
    is_active: (row.is_active ?? 1) as number,
    is_dead: (row.is_dead ?? 0) as number,
    first_met_where: row.first_met_where as string | null,
    first_met_additional_info: row.first_met_additional_info as string | null,
    job: row.job as string | null,
    company: row.company as string | null,
    food_preferences: row.food_preferences as string | null,
    birthday_special_date_id: row.birthday_special_date_id as number | null,
    created_at: row.created_at as string | null,
    updated_at: row.updated_at as string | null,
  }));

  // De-duplicate contacts by ID (SQL may contain multiple INSERT blocks)
  const contactMap = new Map<number, MonicaContact>();
  for (const c of contacts) {
    contactMap.set(c.id, c);
  }

  const contactFields = parseInserts(sql, 'contact_fields').map(row => ({
    id: row.id as number,
    contact_id: row.contact_id as number,
    contact_field_type_id: row.contact_field_type_id as number,
    data: String(row.data ?? ''),
  }));

  const contactFieldTypes = parseInserts(sql, 'contact_field_types').map(row => ({
    id: row.id as number,
    name: (row.name ?? '') as string,
    type: row.type as string | null,
  }));

  const tags = parseInserts(sql, 'tags').map(row => ({
    id: row.id as number,
    name: (row.name ?? '') as string,
    name_slug: row.name_slug as string | null,
  }));

  const contactTags = parseInserts(sql, 'contact_tag').map(row => ({
    contact_id: row.contact_id as number,
    tag_id: row.tag_id as number,
  }));

  const notes = parseInserts(sql, 'notes').map(row => ({
    id: row.id as number,
    contact_id: row.contact_id as number,
    body: (row.body ?? '') as string,
    is_favorited: (row.is_favorited ?? 0) as number,
  }));

  const activities = parseInserts(sql, 'activities').map(row => ({
    id: row.id as number,
    activity_type_id: row.activity_type_id as number | null,
    summary: row.summary as string | null,
    description: row.description as string | null,
    happened_at: row.happened_at as string | null,
    created_at: row.created_at as string | null,
  }));

  const activityContacts = parseInserts(sql, 'activity_contact').map(row => ({
    activity_id: row.activity_id as number,
    contact_id: row.contact_id as number,
  }));

  const specialDates = parseInserts(sql, 'special_dates').map(row => ({
    id: row.id as number,
    contact_id: row.contact_id as number,
    is_age_based: (row.is_age_based ?? 0) as number,
    is_year_unknown: (row.is_year_unknown ?? 0) as number,
    date: row.date as string | null,
  }));

  const relationships = parseInserts(sql, 'relationships').map(row => ({
    id: row.id as number,
    relationship_type_id: row.relationship_type_id as number,
    contact_is: row.contact_is as number,
    of_contact: row.of_contact as number,
  }));

  const relationshipTypes = parseInserts(sql, 'relationship_types').map(row => ({
    id: row.id as number,
    name: (row.name ?? '') as string,
    name_reverse_relationship: (row.name_reverse_relationship ?? '') as string,
    relationship_type_group_id: (row.relationship_type_group_id ?? 0) as number,
  }));

  const addresses = parseInserts(sql, 'addresses').map(row => ({
    id: row.id as number,
    place_id: row.place_id as number,
    contact_id: row.contact_id as number,
    name: row.name as string | null,
  }));

  const places = parseInserts(sql, 'places').map(row => ({
    id: row.id as number,
    street: row.street as string | null,
    city: row.city as string | null,
    province: row.province as string | null,
    postal_code: row.postal_code as string | null,
    country: row.country as string | null,
  }));

  const lifeEvents = parseInserts(sql, 'life_events').map(row => ({
    id: row.id as number,
    contact_id: row.contact_id as number,
    life_event_type_id: row.life_event_type_id as number,
    name: row.name as string | null,
    note: row.note as string | null,
    happened_at: row.happened_at as string | null,
  }));

  const lifeEventTypes = parseInserts(sql, 'life_event_types').map(row => ({
    id: row.id as number,
    life_event_category_id: (row.life_event_category_id ?? 0) as number,
    name: row.name as string | null,
    default_life_event_type_key: row.default_life_event_type_key as string | null,
  }));

  const lifeEventCategories = parseInserts(sql, 'life_event_categories').map(row => ({
    id: row.id as number,
    name: row.name as string | null,
    default_life_event_category_key: row.default_life_event_category_key as string | null,
  }));

  const gifts = parseInserts(sql, 'gifts').map(row => ({
    id: row.id as number,
    contact_id: row.contact_id as number,
    name: (row.name ?? '') as string,
    comment: row.comment as string | null,
    url: row.url as string | null,
    amount: (row.amount ?? 0) as number,
    status: (row.status ?? 'idea') as string,
    date: row.date as string | null,
  }));

  const reminders = parseInserts(sql, 'reminders').map(row => ({
    id: row.id as number,
    contact_id: row.contact_id as number,
    initial_date: (row.initial_date ?? '') as string,
    title: (row.title ?? '') as string,
    description: row.description as string | null,
    frequency_type: (row.frequency_type ?? 'one_time') as string,
    frequency_number: (row.frequency_number ?? 1) as number,
  }));

  const genders = parseInserts(sql, 'genders').map(row => ({
    id: row.id as number,
    name: (row.name ?? '') as string,
    type: (row.type ?? 'O') as string,
  }));

  const calls = parseInserts(sql, 'calls').map(row => ({
    id: row.id as number,
    contact_id: row.contact_id as number,
    called_at: (row.called_at ?? '') as string,
    content: row.content as string | null,
    contact_called: (row.contact_called ?? 0) as number,
  }));

  const entries = parseInserts(sql, 'entries').map(row => ({
    id: row.id as number,
    title: row.title as string | null,
    post: (row.post ?? '') as string,
    created_at: row.created_at as string | null,
  }));

  return {
    contacts: Array.from(contactMap.values()),
    contactFields,
    contactFieldTypes,
    tags,
    contactTags,
    notes,
    activities,
    activityContacts,
    specialDates,
    relationships,
    relationshipTypes,
    addresses,
    places,
    lifeEvents,
    lifeEventTypes,
    lifeEventCategories,
    gifts,
    reminders,
    genders,
    calls,
    entries,
  };
}
