import type Database from 'better-sqlite3';
import { ContactService, type CreateContactInput } from './contacts.js';
import { ContactMethodService, type ContactMethodType } from './contact-methods.js';
import { AddressService } from './addresses.js';
import { NoteService } from './notes.js';
import { TagService } from './tags-groups.js';
import { PlanService, QuotaExceededError } from './plans.js';

// ─── Normalized Contact Shape ───────────────────────────────────
//
// A source-agnostic superset that both the vCard and Google-CSV parsers
// populate. The import pipeline consumes these and persists them via the
// existing services.

export interface NormalizedBirthday {
  mode: 'full_date' | 'month_day' | 'approximate_age';
  date?: string;            // YYYY-MM-DD (full_date)
  month?: number;           // 1-12 (month_day)
  day?: number;             // 1-31 (month_day)
  year_approximate?: number; // (approximate_age)
}

export interface NormalizedMethod {
  type: ContactMethodType;
  value: string;
  label?: string;
}

export interface NormalizedAddress {
  label?: string;
  street_line_1?: string;
  street_line_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
}

export interface NormalizedNote {
  body: string;
}

export interface NormalizedContact {
  // Core contact fields
  first_name: string;
  middle_name?: string;
  last_name?: string;
  nickname?: string;
  gender?: string;
  job_title?: string;
  company?: string;
  birthday?: NormalizedBirthday;
  // Sub-entities
  methods?: NormalizedMethod[];
  addresses?: NormalizedAddress[];
  notes?: Array<string | NormalizedNote>;
  tags?: string[];
}

// ─── Import Summary ─────────────────────────────────────────────

export interface ImportSummary {
  created: number;
  skipped_duplicate: number;
  skipped_quota: number;
  warnings: string[];
  per_entity: {
    contacts: number;
    methods: number;
    addresses: number;
    notes: number;
    tags: number;
  };
}

export interface RunImportOptions {
  planService?: PlanService;
}

// ─── Dedup helpers ──────────────────────────────────────────────

function normalizeName(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function normalizePhone(s: string): string {
  return s.replace(/[\s\-()+]/g, '');
}

/**
 * Decide whether `record` already exists for `userId`.
 *
 * Strategy (mirrors ContactService.findDuplicates intent):
 *  - Find existing, non-deleted contacts with the same normalized full name.
 *  - If the incoming record carries any email/phone methods, only treat it as a
 *    duplicate when an existing same-named contact shares a normalized
 *    email/phone value. Otherwise (record has no methods) a name match alone is
 *    enough.
 *
 * Because created contacts are persisted immediately, this also catches the
 * "same record imported twice" case within a single batch.
 */
function isDuplicate(db: Database.Database, userId: string, record: NormalizedContact): boolean {
  const first = normalizeName(record.first_name);
  const last = normalizeName(record.last_name);

  const sameName = db.prepare(
    `SELECT id FROM contacts
     WHERE user_id = ? AND deleted_at IS NULL
       AND LOWER(TRIM(first_name)) = ?
       AND LOWER(TRIM(COALESCE(last_name, ''))) = ?`,
  ).all(userId, first, last) as { id: string }[];

  if (sameName.length === 0) return false;

  const recordMethods = (record.methods ?? []).filter(
    (m) => m.type === 'email' || m.type === 'phone',
  );

  // No comparable methods on the incoming record → name match is sufficient.
  if (recordMethods.length === 0) return true;

  const recordEmails = new Set(
    recordMethods.filter((m) => m.type === 'email').map((m) => normalizeEmail(m.value)),
  );
  const recordPhones = new Set(
    recordMethods.filter((m) => m.type === 'phone').map((m) => normalizePhone(m.value)),
  );

  for (const cand of sameName) {
    const methods = db.prepare(
      `SELECT type, value FROM contact_methods WHERE contact_id = ? AND type IN ('email', 'phone')`,
    ).all(cand.id) as { type: string; value: string }[];

    for (const m of methods) {
      if (m.type === 'email' && recordEmails.has(normalizeEmail(m.value))) return true;
      if (m.type === 'phone' && recordPhones.has(normalizePhone(m.value))) return true;
    }
  }

  return false;
}

// ─── Pipeline ───────────────────────────────────────────────────

/**
 * Persist a batch of normalized contacts.
 *
 * For each record:
 *  1. Run a dedup check; on a match increment `skipped_duplicate` and continue.
 *  2. If a PlanService is supplied, enforce the contact quota before creating.
 *     On QuotaExceededError, stop creating and count this record plus all
 *     remaining records as `skipped_quota`.
 *  3. Otherwise create the contact and its sub-entities via the existing
 *     services, tallying per-entity counts.
 */
export function runImportPipeline(
  db: Database.Database,
  userId: string,
  records: NormalizedContact[],
  opts: RunImportOptions = {},
): ImportSummary {
  const contacts = new ContactService(db);
  const methods = new ContactMethodService(db);
  const addresses = new AddressService(db);
  const notes = new NoteService(db);
  const tags = new TagService(db);

  const summary: ImportSummary = {
    created: 0,
    skipped_duplicate: 0,
    skipped_quota: 0,
    warnings: [],
    per_entity: { contacts: 0, methods: 0, addresses: 0, notes: 0, tags: 0 },
  };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if (!record.first_name || record.first_name.trim() === '') {
      summary.warnings.push(`Record ${i + 1}: missing first name; skipped`);
      continue;
    }

    if (isDuplicate(db, userId, record)) {
      summary.skipped_duplicate++;
      continue;
    }

    // Quota enforcement before creating the contact.
    if (opts.planService) {
      try {
        opts.planService.enforceContactQuota(userId, 1);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          // This record and all the rest are skipped.
          summary.skipped_quota += records.length - i;
          summary.warnings.push(err.message);
          break;
        }
        throw err;
      }
    }

    const input: CreateContactInput = {
      first_name: record.first_name.trim(),
      middle_name: record.middle_name,
      last_name: record.last_name,
      nickname: record.nickname,
      gender: record.gender,
      job_title: record.job_title,
      company: record.company,
    };

    if (record.birthday) {
      input.birthday_mode = record.birthday.mode;
      input.birthday_date = record.birthday.date;
      input.birthday_month = record.birthday.month;
      input.birthday_day = record.birthday.day;
      input.birthday_year_approximate = record.birthday.year_approximate;
    }

    let contact;
    try {
      contact = contacts.create(userId, input);
    } catch (err: any) {
      summary.warnings.push(`Record ${i + 1} (${record.first_name}): ${err.message}`);
      continue;
    }

    summary.created++;
    summary.per_entity.contacts++;

    for (const m of record.methods ?? []) {
      if (!m.value || m.value.trim() === '') continue;
      try {
        methods.add({ contact_id: contact.id, type: m.type, value: m.value.trim(), label: m.label });
        summary.per_entity.methods++;
      } catch (err: any) {
        summary.warnings.push(`Record ${i + 1} method (${m.type}): ${err.message}`);
      }
    }

    for (const a of record.addresses ?? []) {
      // Skip entirely empty address blocks.
      if (!a.street_line_1 && !a.street_line_2 && !a.city && !a.state_province && !a.postal_code && !a.country) {
        continue;
      }
      try {
        addresses.add({ contact_id: contact.id, ...a });
        summary.per_entity.addresses++;
      } catch (err: any) {
        summary.warnings.push(`Record ${i + 1} address: ${err.message}`);
      }
    }

    for (const n of record.notes ?? []) {
      const body = typeof n === 'string' ? n : n.body;
      if (!body || body.trim() === '') continue;
      try {
        notes.create(userId, { contact_id: contact.id, body });
        summary.per_entity.notes++;
      } catch (err: any) {
        summary.warnings.push(`Record ${i + 1} note: ${err.message}`);
      }
    }

    for (const t of record.tags ?? []) {
      const name = t.trim();
      if (!name) continue;
      try {
        tags.tagContact(userId, contact.id, name);
        summary.per_entity.tags++;
      } catch (err: any) {
        summary.warnings.push(`Record ${i + 1} tag (${name}): ${err.message}`);
      }
    }
  }

  return summary;
}
