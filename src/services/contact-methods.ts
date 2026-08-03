import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { recordAudit, userIdForContact } from './audit-helper.js';

// ─── Types ──────────────────────────────────────────────────────

export type ContactMethodType = string;

export interface ContactMethod {
  id: string;
  contact_id: string;
  type: ContactMethodType;
  value: string;
  label: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateContactMethodInput {
  contact_id: string;
  type: ContactMethodType;
  value: string;
  label?: string;
  is_primary?: boolean;
}

export interface UpdateContactMethodInput {
  type?: ContactMethodType;
  value?: string;
  label?: string;
  is_primary?: boolean;
}

// ─── Service ────────────────────────────────────────────────────

export class ContactMethodService {
  constructor(private db: Database.Database) {}

  add(input: CreateContactMethodInput): ContactMethod {
    const id = generateId();
    const now = new Date().toISOString();

    // If setting as primary, unset other primaries of same type
    if (input.is_primary) {
      this.db.prepare(`
        UPDATE contact_methods SET is_primary = 0, updated_at = ?
        WHERE contact_id = ? AND type = ?
      `).run(now, input.contact_id, input.type);
    }

    this.db.prepare(`
      INSERT INTO contact_methods (id, contact_id, type, value, label, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.type, input.value, input.label ?? null, input.is_primary ? 1 : 0, now, now);

    const created = this.getById(id)!;
    const userId = userIdForContact(this.db, input.contact_id);
    if (userId) recordAudit(this.db, userId, 'contact_method', id, 'create', undefined, created);
    return created;
  }

  update(id: string, input: UpdateContactMethodInput): ContactMethod | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type); }
    if (input.value !== undefined) { fields.push('value = ?'); values.push(input.value); }
    if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
    if (input.is_primary !== undefined) {
      fields.push('is_primary = ?');
      values.push(input.is_primary ? 1 : 0);

      // Unset other primaries of same type
      if (input.is_primary) {
        const type = input.type ?? existing.type;
        this.db.prepare(`
          UPDATE contact_methods SET is_primary = 0, updated_at = datetime('now')
          WHERE contact_id = ? AND type = ? AND id != ?
        `).run(existing.contact_id, type, id);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE contact_methods SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = this.getById(id);
    const userId = userIdForContact(this.db, existing.contact_id);
    if (userId && updated) recordAudit(this.db, userId, 'contact_method', id, 'update', existing, updated);
    return updated;
  }

  updateForContact(contactId: string, id: string, input: UpdateContactMethodInput): ContactMethod | null {
    const existing = this.getById(id);
    if (!existing || existing.contact_id !== contactId) return null;
    return this.update(id, input);
  }

  remove(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    const result = this.db.prepare('DELETE FROM contact_methods WHERE id = ?').run(id);
    const deleted = result.changes > 0;
    const userId = userIdForContact(this.db, existing.contact_id);
    if (deleted && userId) recordAudit(this.db, userId, 'contact_method', id, 'delete', existing, undefined);
    return deleted;
  }

  removeForContact(contactId: string, id: string): boolean {
    const existing = this.getById(id);
    if (!existing || existing.contact_id !== contactId) return false;
    return this.remove(id);
  }

  listByContact(contactId: string): ContactMethod[] {
    const rows = this.db.prepare(
      'SELECT * FROM contact_methods WHERE contact_id = ? ORDER BY is_primary DESC, type, created_at'
    ).all(contactId) as any[];
    return rows.map((r) => ({ ...r, is_primary: Boolean(r.is_primary) }));
  }

  private getById(id: string): ContactMethod | null {
    const row = this.db.prepare('SELECT * FROM contact_methods WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, is_primary: Boolean(row.is_primary) };
  }
}
