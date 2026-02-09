import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export interface Address {
  id: string;
  contact_id: string;
  label: string | null;
  street_line_1: string | null;
  street_line_2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAddressInput {
  contact_id: string;
  label?: string;
  street_line_1?: string;
  street_line_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  is_primary?: boolean;
}

export interface UpdateAddressInput {
  label?: string;
  street_line_1?: string;
  street_line_2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  is_primary?: boolean;
}

// ─── Service ────────────────────────────────────────────────────

export class AddressService {
  constructor(private db: Database.Database) {}

  add(input: CreateAddressInput): Address {
    const id = generateId();
    const now = new Date().toISOString();

    if (input.is_primary) {
      this.db.prepare(`
        UPDATE addresses SET is_primary = 0, updated_at = ? WHERE contact_id = ?
      `).run(now, input.contact_id);
    }

    this.db.prepare(`
      INSERT INTO addresses (id, contact_id, label, street_line_1, street_line_2, city, state_province, postal_code, country, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.contact_id, input.label ?? null,
      input.street_line_1 ?? null, input.street_line_2 ?? null,
      input.city ?? null, input.state_province ?? null,
      input.postal_code ?? null, input.country ?? null,
      input.is_primary ? 1 : 0, now, now,
    );

    return this.getById(id)!;
  }

  update(id: string, input: UpdateAddressInput): Address | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    const simpleFields = ['label', 'street_line_1', 'street_line_2', 'city', 'state_province', 'postal_code', 'country'] as const;
    for (const f of simpleFields) {
      if (input[f] !== undefined) { fields.push(`${f} = ?`); values.push(input[f] ?? null); }
    }

    if (input.is_primary !== undefined) {
      fields.push('is_primary = ?');
      values.push(input.is_primary ? 1 : 0);
      if (input.is_primary) {
        this.db.prepare(`
          UPDATE addresses SET is_primary = 0, updated_at = datetime('now')
          WHERE contact_id = ? AND id != ?
        `).run(existing.contact_id, id);
      }
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE addresses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  remove(id: string): boolean {
    const result = this.db.prepare('DELETE FROM addresses WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listByContact(contactId: string): Address[] {
    const rows = this.db.prepare(
      'SELECT * FROM addresses WHERE contact_id = ? ORDER BY is_primary DESC, created_at'
    ).all(contactId) as any[];
    return rows.map((r) => ({ ...r, is_primary: Boolean(r.is_primary) }));
  }

  private getById(id: string): Address | null {
    const row = this.db.prepare('SELECT * FROM addresses WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, is_primary: Boolean(row.is_primary) };
  }
}
