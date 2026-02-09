import Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export interface CustomField {
  id: string;
  contact_id: string;
  field_name: string;
  field_value: string;
  field_group: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomFieldInput {
  contact_id: string;
  field_name: string;
  field_value: string;
  field_group?: string;
}

export interface UpdateCustomFieldInput {
  field_name?: string;
  field_value?: string;
  field_group?: string;
}

// ─── Service ────────────────────────────────────────────────────

export class CustomFieldService {
  constructor(private db: Database.Database) {}

  add(input: CreateCustomFieldInput): CustomField {
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO custom_fields (id, contact_id, field_name, field_value, field_group, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.field_name, input.field_value, input.field_group ?? null, now, now);

    return this.getById(id)!;
  }

  update(id: string, input: UpdateCustomFieldInput): CustomField | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.field_name !== undefined) { fields.push('field_name = ?'); values.push(input.field_name); }
    if (input.field_value !== undefined) { fields.push('field_value = ?'); values.push(input.field_value); }
    if (input.field_group !== undefined) { fields.push('field_group = ?'); values.push(input.field_group); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE custom_fields SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM custom_fields WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listByContact(contactId: string): CustomField[] {
    return this.db.prepare(
      'SELECT * FROM custom_fields WHERE contact_id = ? ORDER BY field_group, field_name'
    ).all(contactId) as CustomField[];
  }

  private getById(id: string): CustomField | null {
    return this.db.prepare('SELECT * FROM custom_fields WHERE id = ?').get(id) as CustomField | undefined ?? null;
  }
}
