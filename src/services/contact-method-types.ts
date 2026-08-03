import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { recordAudit } from './audit-helper.js';

export const BUILT_IN_CONTACT_METHOD_TYPES = [
  { key: 'email', label: 'Email', link_template: 'mailto:{value}' },
  { key: 'phone', label: 'Phone', link_template: 'tel:{value}' },
  { key: 'whatsapp', label: 'WhatsApp', link_template: 'https://wa.me/{value}' },
  { key: 'telegram', label: 'Telegram', link_template: 'https://t.me/{value}' },
  { key: 'signal', label: 'Signal', link_template: 'https://signal.me/#p/{value}' },
  { key: 'twitter', label: 'Twitter / X', link_template: 'https://x.com/{value}' },
  { key: 'instagram', label: 'Instagram', link_template: 'https://instagram.com/{value}' },
  { key: 'facebook', label: 'Facebook Messenger', link_template: 'https://m.me/{value}' },
  { key: 'linkedin', label: 'LinkedIn', link_template: 'https://www.linkedin.com/in/{value}' },
  { key: 'website', label: 'Website', link_template: '{value}' },
  { key: 'other', label: 'Other', link_template: null },
] as const;

const BUILT_IN_BY_KEY = new Map(BUILT_IN_CONTACT_METHOD_TYPES.map((type) => [type.key, type]));
const DANGEROUS_SCHEME = /^(?:javascript|data|vbscript):/i;
const SAFE_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export interface ContactMethodTypeConfig {
  id: string;
  user_id: string;
  key: string;
  label: string;
  link_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactMethodTypeOption {
  id: string | null;
  key: string;
  label: string;
  link_template: string | null;
  default_link_template: string | null;
  source: 'built-in' | 'custom' | 'override';
  is_built_in: boolean;
}

export interface UpsertContactMethodTypeInput {
  key: string;
  label?: string;
  link_template?: string | null;
}

function labelForKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeContactMethodTypeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function transformedValue(typeKey: string, value: string): string {
  const trimmed = value.trim();
  switch (typeKey) {
    case 'phone':
      return trimmed.replace(/\s+/g, '');
    case 'whatsapp':
      return trimmed.replace(/\D+/g, '');
    case 'telegram':
    case 'twitter':
    case 'instagram':
      return trimmed.replace(/^@+/, '');
    case 'website': {
      if (!trimmed) return '';
      return SAFE_SCHEME.test(trimmed) || trimmed.startsWith('//') ? trimmed : `https://${trimmed}`;
    }
    default:
      return trimmed;
  }
}

function shouldEncodePlaceholder(typeKey: string): boolean {
  return !['email', 'phone', 'website'].includes(typeKey);
}

export function buildContactMethodLink(typeKey: string, value: string, template?: string | null): string | null {
  try {
    const key = normalizeContactMethodTypeKey(typeKey);
    const resolvedTemplate = template === undefined
      ? BUILT_IN_BY_KEY.get(key as typeof BUILT_IN_CONTACT_METHOD_TYPES[number]['key'])?.link_template ?? null
      : template;
    if (!resolvedTemplate?.trim() || !resolvedTemplate.includes('{value}')) return null;

    const transformed = transformedValue(key, value);
    if (!transformed) return null;

    const substitution = shouldEncodePlaceholder(key) ? encodeURIComponent(transformed) : transformed;
    const link = resolvedTemplate.replaceAll('{value}', substitution).trim();
    if (!link || DANGEROUS_SCHEME.test(link)) return null;

    if (key === 'website' && DANGEROUS_SCHEME.test(transformed)) return null;
    return link;
  } catch {
    return null;
  }
}

export function getBuiltInContactMethodTypeOptions(): ContactMethodTypeOption[] {
  return BUILT_IN_CONTACT_METHOD_TYPES.map((type) => ({
    id: null,
    key: type.key,
    label: type.label,
    link_template: type.link_template,
    default_link_template: type.link_template,
    source: 'built-in',
    is_built_in: true,
  }));
}

export class ContactMethodTypeService {
  constructor(private db: Database.Database) {}

  list(userId: string): ContactMethodTypeConfig[] {
    return this.db.prepare(`
      SELECT * FROM contact_method_types
      WHERE user_id = ?
      ORDER BY key COLLATE NOCASE
    `).all(userId) as ContactMethodTypeConfig[];
  }

  get(userId: string, key: string): ContactMethodTypeConfig | null {
    const normalized = normalizeContactMethodTypeKey(key);
    const row = this.db.prepare('SELECT * FROM contact_method_types WHERE user_id = ? AND key = ?')
      .get(userId, normalized) as ContactMethodTypeConfig | undefined;
    return row ?? null;
  }

  mergedList(userId: string): ContactMethodTypeOption[] {
    const rows = this.list(userId);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const options: ContactMethodTypeOption[] = [];

    for (const builtIn of BUILT_IN_CONTACT_METHOD_TYPES) {
      const override = byKey.get(builtIn.key);
      if (override) byKey.delete(builtIn.key);
      options.push({
        id: override?.id ?? null,
        key: builtIn.key,
        label: override?.label ?? builtIn.label,
        link_template: override ? override.link_template : builtIn.link_template,
        default_link_template: builtIn.link_template,
        source: override ? 'override' : 'built-in',
        is_built_in: true,
      });
    }

    for (const custom of [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label))) {
      options.push({
        id: custom.id,
        key: custom.key,
        label: custom.label,
        link_template: custom.link_template,
        default_link_template: null,
        source: 'custom',
        is_built_in: false,
      });
    }

    return options;
  }

  upsert(userId: string, input: UpsertContactMethodTypeInput): ContactMethodTypeConfig {
    const key = normalizeContactMethodTypeKey(input.key);
    if (!key) throw new Error('Key must include at least one letter or number');
    const builtIn = BUILT_IN_BY_KEY.get(key as typeof BUILT_IN_CONTACT_METHOD_TYPES[number]['key']);
    const label = input.label?.trim() || builtIn?.label || labelForKey(key);
    const linkTemplate = input.link_template === undefined ? (builtIn?.link_template ?? null) : normalizeTemplate(input.link_template);
    const existing = this.get(userId, key);

    if (existing) {
      this.db.prepare(`
        UPDATE contact_method_types
        SET label = ?, link_template = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(label, linkTemplate, existing.id, userId);
      const updated = this.get(userId, key)!;
      recordAudit(this.db, userId, 'contact_method_type', updated.id, 'update', existing, updated);
      return updated;
    }

    const id = generateId();
    try {
      this.db.prepare(`
        INSERT INTO contact_method_types (id, user_id, key, label, link_template)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, userId, key, label, linkTemplate);
    } catch (err: any) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(err?.message ?? '').includes('UNIQUE constraint failed')) {
        throw new Error('A contact method type with this key already exists');
      }
      throw err;
    }
    const created = this.get(userId, key)!;
    recordAudit(this.db, userId, 'contact_method_type', id, 'create', undefined, created);
    return created;
  }

  update(userId: string, keyOrId: string, input: Partial<UpsertContactMethodTypeInput>): ContactMethodTypeConfig | null {
    const existing = this.findByKeyOrId(userId, keyOrId);
    if (!existing) return null;
    const nextKey = input.key !== undefined ? normalizeContactMethodTypeKey(input.key) : existing.key;
    if (!nextKey) throw new Error('Key must include at least one letter or number');
    const builtIn = BUILT_IN_BY_KEY.get(nextKey as typeof BUILT_IN_CONTACT_METHOD_TYPES[number]['key']);
    const label = input.label !== undefined ? input.label.trim() : existing.label;
    if (!label) throw new Error('Label is required');
    const linkTemplate = input.link_template !== undefined ? normalizeTemplate(input.link_template) : existing.link_template;

    try {
      this.db.prepare(`
        UPDATE contact_method_types
        SET key = ?, label = ?, link_template = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(nextKey, label || builtIn?.label || labelForKey(nextKey), linkTemplate, existing.id, userId);
    } catch (err: any) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(err?.message ?? '').includes('UNIQUE constraint failed')) {
        throw new Error('A contact method type with this key already exists');
      }
      throw err;
    }

    const updated = this.get(userId, nextKey);
    if (updated) recordAudit(this.db, userId, 'contact_method_type', updated.id, 'update', existing, updated);
    return updated;
  }

  delete(userId: string, keyOrId: string): boolean {
    const existing = this.findByKeyOrId(userId, keyOrId);
    if (!existing) return false;
    const result = this.db.prepare('DELETE FROM contact_method_types WHERE id = ? AND user_id = ?').run(existing.id, userId);
    const deleted = result.changes > 0;
    if (deleted) recordAudit(this.db, userId, 'contact_method_type', existing.id, 'delete', existing, undefined);
    return deleted;
  }

  private findByKeyOrId(userId: string, keyOrId: string): ContactMethodTypeConfig | null {
    const normalized = normalizeContactMethodTypeKey(keyOrId);
    const row = this.db.prepare(`
      SELECT * FROM contact_method_types
      WHERE user_id = ? AND (id = ? OR key = ?)
      LIMIT 1
    `).get(userId, keyOrId, normalized) as ContactMethodTypeConfig | undefined;
    return row ?? null;
  }
}

function normalizeTemplate(template: string | null | undefined): string | null {
  const trimmed = template?.trim() ?? '';
  return trimmed ? trimmed : null;
}
