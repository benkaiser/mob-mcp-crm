import type {
  NormalizedContact,
  NormalizedMethod,
  NormalizedAddress,
  NormalizedBirthday,
} from './import-pipeline.js';
import type { ContactMethodType } from './contact-methods.js';

/**
 * Parser for vCard (.vcf) files. Supports vCard 3.0 and 4.0, multiple VCARDs
 * per file, line folding/continuation, and the common contact fields.
 *
 * Dependency-free; hand-rolled.
 */

interface VCardLine {
  name: string;                       // upper-cased property name, e.g. EMAIL
  params: Record<string, string[]>;   // upper-cased param name → values
  value: string;
}

// ─── Folding / line splitting ───────────────────────────────────

/**
 * Unfold lines: per RFC 6350/2426 a line beginning with a space or tab is a
 * continuation of the previous line (the leading whitespace is removed).
 */
function unfoldLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const raw of rawLines) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

// ─── Property line parsing ──────────────────────────────────────

/**
 * Parse a content line into name, params, and value.
 * e.g. `EMAIL;TYPE=WORK:jane@example.com`
 */
function parseLine(line: string): VCardLine | null {
  const colonIdx = findValueColon(line);
  if (colonIdx === -1) return null;

  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);

  const segments = splitParams(head);
  const name = (segments[0] ?? '').trim().toUpperCase();
  // Strip any group prefix like "item1.EMAIL"
  const dotIdx = name.lastIndexOf('.');
  const propName = dotIdx === -1 ? name : name.slice(dotIdx + 1);

  const params: Record<string, string[]> = {};
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const eq = seg.indexOf('=');
    if (eq === -1) {
      // Bare param (old vCard 2.1 style), treat as a TYPE value.
      const v = seg.trim().toUpperCase();
      if (v) (params['TYPE'] ??= []).push(v);
    } else {
      const key = seg.slice(0, eq).trim().toUpperCase();
      const rawVal = seg.slice(eq + 1).trim();
      const vals = rawVal.split(',').map((v) => v.trim().replace(/^"|"$/g, '')).filter(Boolean);
      (params[key] ??= []).push(...vals.map((v) => v.toUpperCase()));
    }
  }

  return { name: propName, params, value };
}

/** Find the colon that separates params from value, ignoring colons inside quotes. */
function findValueColon(line: string): number {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ':' && !inQuote) return i;
  }
  return -1;
}

/** Split the property head on ';' while respecting quoted params. */
function splitParams(head: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (ch === '"') { inQuote = !inQuote; cur += ch; }
    else if (ch === ';' && !inQuote) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Unescape a vCard value: \\n \\, \\; \\\\ */
function unescapeValue(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** Split a structured value on unescaped semicolons. */
function splitStructured(v: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) { cur += v[i] + v[i + 1]; i++; continue; }
    if (v[i] === ';') { parts.push(cur); cur = ''; continue; }
    cur += v[i];
  }
  parts.push(cur);
  return parts.map(unescapeValue);
}

// ─── Field mapping ──────────────────────────────────────────────

const TEL_TYPE_MAP: Record<string, ContactMethodType> = {
  WHATSAPP: 'whatsapp',
};

function telTypeFor(_params: Record<string, string[]>): ContactMethodType {
  return 'phone';
}

function labelFromTypes(params: Record<string, string[]>): string | undefined {
  const types = params['TYPE'] ?? [];
  const friendly = types.filter((t) => t !== 'PREF' && t !== 'INTERNET' && t !== 'VOICE');
  if (friendly.length === 0) return undefined;
  return friendly
    .map((t) => t.charAt(0) + t.slice(1).toLowerCase())
    .join(', ');
}

function parseBirthday(value: string): NormalizedBirthday | null {
  const v = value.trim();
  // Full date YYYY-MM-DD or YYYYMMDD
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { mode: 'full_date', date: `${m[1]}-${m[2]}-${m[3]}` };
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { mode: 'full_date', date: `${m[1]}-${m[2]}-${m[3]}` };
  // vCard 4.0 month-day with unknown year: --MM-DD or --MMDD
  m = v.match(/^--(\d{2})-?(\d{2})$/);
  if (m) return { mode: 'month_day', month: parseInt(m[1], 10), day: parseInt(m[2], 10) };
  return null;
}

// ─── Card assembly ──────────────────────────────────────────────

function buildContact(lines: VCardLine[]): NormalizedContact | null {
  const contact: NormalizedContact = { first_name: '' };
  const methods: NormalizedMethod[] = [];
  const addresses: NormalizedAddress[] = [];
  const notes: string[] = [];
  const tags: string[] = [];
  let fnValue = '';

  for (const line of lines) {
    switch (line.name) {
      case 'FN':
        fnValue = unescapeValue(line.value).trim();
        break;
      case 'N': {
        // family;given;additional;prefix;suffix
        const parts = splitStructured(line.value);
        const family = parts[0]?.trim();
        const given = parts[1]?.trim();
        const additional = parts[2]?.trim();
        if (given) contact.first_name = given;
        if (family) contact.last_name = family;
        if (additional) contact.middle_name = additional;
        break;
      }
      case 'NICKNAME': {
        const nick = unescapeValue(line.value).split(',')[0]?.trim();
        if (nick) contact.nickname = nick;
        break;
      }
      case 'EMAIL': {
        const value = unescapeValue(line.value).trim();
        if (value) methods.push({ type: 'email', value, label: labelFromTypes(line.params) });
        break;
      }
      case 'TEL': {
        const value = unescapeValue(line.value).trim();
        if (value) {
          const types = line.params['TYPE'] ?? [];
          let type: ContactMethodType = telTypeFor(line.params);
          for (const t of types) if (TEL_TYPE_MAP[t]) type = TEL_TYPE_MAP[t];
          methods.push({ type, value, label: labelFromTypes(line.params) });
        }
        break;
      }
      case 'ADR': {
        // pobox;ext;street;locality;region;postal;country
        const p = splitStructured(line.value);
        addresses.push({
          label: labelFromTypes(line.params),
          street_line_1: [p[0], p[1], p[2]].filter((s) => s && s.trim()).join(' ').trim() || undefined,
          city: p[3]?.trim() || undefined,
          state_province: p[4]?.trim() || undefined,
          postal_code: p[5]?.trim() || undefined,
          country: p[6]?.trim() || undefined,
        });
        break;
      }
      case 'BDAY': {
        const bday = parseBirthday(line.value);
        if (bday) contact.birthday = bday;
        break;
      }
      case 'ORG': {
        // org;department
        const parts = splitStructured(line.value);
        const org = parts[0]?.trim();
        if (org) contact.company = org;
        break;
      }
      case 'TITLE': {
        const t = unescapeValue(line.value).trim();
        if (t) contact.job_title = t;
        break;
      }
      case 'URL': {
        const value = unescapeValue(line.value).trim();
        if (value) methods.push({ type: 'website', value, label: labelFromTypes(line.params) });
        break;
      }
      case 'NOTE': {
        const body = unescapeValue(line.value).trim();
        if (body) notes.push(body);
        break;
      }
      case 'CATEGORIES': {
        for (const c of unescapeValue(line.value).split(',')) {
          const name = c.trim();
          if (name) tags.push(name);
        }
        break;
      }
      // PHOTO and everything else are ignored.
    }
  }

  // Derive a name from FN if N didn't provide one.
  if (!contact.first_name && fnValue) {
    const parts = fnValue.split(/\s+/);
    contact.first_name = parts[0];
    if (parts.length > 1) contact.last_name ??= parts.slice(1).join(' ');
  }

  if (!contact.first_name) return null;

  if (methods.length) contact.methods = methods;
  if (addresses.length) contact.addresses = addresses;
  if (notes.length) contact.notes = notes;
  if (tags.length) contact.tags = tags;

  return contact;
}

// ─── Entry point ────────────────────────────────────────────────

export function parseVCard(text: string): NormalizedContact[] {
  const lines = unfoldLines(text);
  const contacts: NormalizedContact[] = [];

  let current: VCardLine[] | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    const upper = trimmed.toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      current = [];
      continue;
    }
    if (upper === 'END:VCARD') {
      if (current) {
        const contact = buildContact(current);
        if (contact) contacts.push(contact);
      }
      current = null;
      continue;
    }
    if (current === null) continue;

    const parsed = parseLine(trimmed);
    if (!parsed) continue;
    // Embedded base64 PHOTO data is intentionally ignored.
    if (parsed.name === 'PHOTO') continue;
    current.push(parsed);
  }

  return contacts;
}
