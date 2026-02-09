import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export type LifeEventCategory =
  | 'education' | 'career' | 'relationships' | 'living'
  | 'health' | 'achievement' | 'loss' | 'other';

export interface LifeEvent {
  id: string;
  contact_id: string;
  event_type: string;
  title: string;
  description: string | null;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  related_contacts?: string[];
}

export interface CreateLifeEventInput {
  contact_id: string;
  event_type: string;
  title: string;
  description?: string;
  occurred_at?: string;
  related_contact_ids?: string[];
}

export interface UpdateLifeEventInput {
  event_type?: string;
  title?: string;
  description?: string;
  occurred_at?: string;
  related_contact_ids?: string[];
}

export interface ListLifeEventsOptions {
  page?: number;
  per_page?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Service ────────────────────────────────────────────────────

export class LifeEventService {
  constructor(private db: Database.Database) {}

  create(input: CreateLifeEventInput): LifeEvent {
    const id = generateId();
    const now = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO life_events (id, contact_id, event_type, title, description, occurred_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.contact_id, input.event_type, input.title,
        input.description ?? null, input.occurred_at ?? null, now, now);

      if (input.related_contact_ids) {
        const stmt = this.db.prepare(
          'INSERT INTO life_event_contacts (life_event_id, contact_id) VALUES (?, ?)'
        );
        for (const contactId of input.related_contact_ids) {
          stmt.run(id, contactId);
        }
      }
    });

    transaction();
    return this.getById(id)!;
  }

  get(eventId: string): LifeEvent | null {
    return this.getById(eventId);
  }

  update(id: string, input: UpdateLifeEventInput): LifeEvent | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.event_type !== undefined) { fields.push('event_type = ?'); values.push(input.event_type); }
    if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.occurred_at !== undefined) { fields.push('occurred_at = ?'); values.push(input.occurred_at); }

    const transaction = this.db.transaction(() => {
      if (fields.length > 0) {
        fields.push("updated_at = datetime('now')");
        values.push(id);
        this.db.prepare(`UPDATE life_events SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...values);
      }

      if (input.related_contact_ids !== undefined) {
        this.db.prepare('DELETE FROM life_event_contacts WHERE life_event_id = ?').run(id);
        const stmt = this.db.prepare(
          'INSERT INTO life_event_contacts (life_event_id, contact_id) VALUES (?, ?)'
        );
        for (const contactId of input.related_contact_ids) {
          stmt.run(id, contactId);
        }
      }
    });

    transaction();
    return this.getById(id);
  }

  softDelete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE life_events SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  listByContact(contactId: string, options: ListLifeEventsOptions = {}): PaginatedResult<LifeEvent> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const countResult = this.db.prepare(
      'SELECT COUNT(*) as count FROM life_events WHERE contact_id = ? AND deleted_at IS NULL'
    ).get(contactId) as any;

    const rows = this.db.prepare(
      'SELECT * FROM life_events WHERE contact_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC, created_at DESC LIMIT ? OFFSET ?'
    ).all(contactId, perPage, offset) as any[];

    const data = rows.map((row) => ({
      ...row,
      related_contacts: this.getRelatedContacts(row.id),
    }));

    return { data, total: countResult.count, page, per_page: perPage };
  }

  private getById(id: string): LifeEvent | null {
    const row = this.db.prepare(
      'SELECT * FROM life_events WHERE id = ? AND deleted_at IS NULL'
    ).get(id) as any;
    if (!row) return null;

    return {
      ...row,
      related_contacts: this.getRelatedContacts(id),
    };
  }

  private getRelatedContacts(eventId: string): string[] {
    const rows = this.db.prepare(
      'SELECT contact_id FROM life_event_contacts WHERE life_event_id = ?'
    ).all(eventId) as any[];
    return rows.map((r) => r.contact_id);
  }
}
