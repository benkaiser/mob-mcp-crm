import type {
  NormalizedContact,
  NormalizedMethod,
  NormalizedAddress,
  NormalizedBirthday,
} from './import-pipeline.js';
import type { ContactMethodType } from './contact-methods.js';

/**
 * Parser for Google Contacts CSV exports. Dependency-free, hand-rolled CSV
 * line parsing that handles quoted fields containing commas and escaped
 * double-quotes ("").
 *
 * Google joins multiple values within a single cell using " ::: ".
 */

const MULTI_VALUE_SEP = ' ::: ';

// ─── CSV parsing ────────────���───────────────────────────────────

/**
 * Parse an entire CSV document into rows of string cells. Handles quoted
 * fields (which may contain commas and newlines) and escaped quotes ("").
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
      i++; continue;
    }
    field += ch; i++;
  }
  // Flush trailing field/row.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function splitMulti(value: string): string[] {
  return value.split(MULTI_VALUE_SEP).map((v) => v.trim()).filter(Boolean);
}

// ─── Type mapping ─────────────────────────────��─────────────────

const METHOD_TYPE_BY_LABEL: Record<string, ContactMethodType> = {
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  signal: 'signal',
  twitter: 'twitter',
  instagram: 'instagram',
  facebook: 'facebook',
  linkedin: 'linkedin',
};

function emailType(): ContactMethodType { return 'email'; }
function phoneType(): ContactMethodType { return 'phone'; }

function parseBirthday(value: string): NormalizedBirthday | null {
  const v = value.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { mode: 'full_date', date: `${m[1]}-${m[2]}-${m[3]}` };
  // Google uses --MM-DD when the year is unknown.
  m = v.match(/^--(\d{2})-(\d{2})$/);
  if (m) return { mode: 'month_day', month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
  return null;
}

// ─── Row → NormalizedContact ────────────────────────────────────

function buildContact(get: (col: string) => string): NormalizedContact | null {
  const contact: NormalizedContact = { first_name: '' };

  const given = get('Given Name') || get('First Name');
  const family = get('Family Name') || get('Last Name');
  const additional = get('Additional Name') || get('Middle Name');
  const nickname = get('Nickname');
  const fullName = get('Name');

  if (given) contact.first_name = given;
  if (family) contact.last_name = family;
  if (additional) contact.middle_name = additional;

  if (!contact.first_name && fullName) {
    const parts = fullName.trim().split(/\s+/);
    contact.first_name = parts[0];
    if (parts.length > 1 && !contact.last_name) contact.last_name = parts.slice(1).join(' ');
  }
  if (nickname) contact.nickname = nickname;

  const org = get('Organization Name') || get('Organization 1 - Name');
  const title = get('Organization Title') || get('Organization 1 - Title');
  if (org) contact.company = org;
  if (title) contact.job_title = title;

  const bday = parseBirthday(get('Birthday'));
  if (bday) contact.birthday = bday;

  const methods: NormalizedMethod[] = [];
  // E-mail 1..N and Phone 1..N
  for (let n = 1; n <= 10; n++) {
    const emailVal = get(`E-mail ${n} - Value`);
    if (emailVal) {
      const label = get(`E-mail ${n} - Type`) || undefined;
      for (const v of splitMulti(emailVal)) methods.push({ type: emailType(), value: v, label });
    }
    const phoneVal = get(`Phone ${n} - Value`);
    if (phoneVal) {
      const label = get(`Phone ${n} - Type`) || undefined;
      const typed = label ? METHOD_TYPE_BY_LABEL[label.toLowerCase()] : undefined;
      for (const v of splitMulti(phoneVal)) {
        methods.push({ type: typed ?? phoneType(), value: v, label });
      }
    }
  }
  if (methods.length) contact.methods = methods;

  const addresses: NormalizedAddress[] = [];
  for (let n = 1; n <= 5; n++) {
    const prefix = `Address ${n} - `;
    const street = get(`${prefix}Street`);
    const city = get(`${prefix}City`);
    const region = get(`${prefix}Region`);
    const postal = get(`${prefix}Postal Code`);
    const country = get(`${prefix}Country`);
    const formatted = get(`${prefix}Formatted`);
    if (street || city || region || postal || country) {
      addresses.push({
        label: get(`${prefix}Type`) || undefined,
        street_line_1: street || (formatted ? formatted.split('\n')[0] : undefined) || undefined,
        city: city || undefined,
        state_province: region || undefined,
        postal_code: postal || undefined,
        country: country || undefined,
      });
    }
  }
  if (addresses.length) contact.addresses = addresses;

  const notesVal = get('Notes');
  if (notesVal) contact.notes = [notesVal];

  const labels = get('Labels') || get('Group Membership');
  if (labels) {
    const tags = splitMulti(labels)
      .map((l) => l.replace(/^\*\s*/, '').replace(/^System Group:\s*/i, '').trim())
      .filter((l) => l && l.toLowerCase() !== 'my contacts' && l.toLowerCase() !== 'starred');
    if (tags.length) contact.tags = tags;
  }

  if (!contact.first_name) return null;
  return contact;
}

// ─── Entry point ────────────────────────────────────────────────

export function parseGoogleCsv(text: string): NormalizedContact[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim());
  const index = new Map<string, number>();
  header.forEach((h, i) => { if (!index.has(h)) index.set(h, i); });

  const contacts: NormalizedContact[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    // Skip fully blank lines.
    if (cells.every((c) => c.trim() === '')) continue;

    const get = (col: string): string => {
      const idx = index.get(col);
      if (idx === undefined) return '';
      return (cells[idx] ?? '').trim();
    };

    const contact = buildContact(get);
    if (contact) contacts.push(contact);
  }

  return contacts;
}
