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
  include_deleted?: boolean;
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

  create(userId: string, input: CreateLifeEventInput): LifeEvent {
    // Verify the contact belongs to the user
    this.verifyContactOwnership(userId, input.contact_id);

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
    return this.getById(userId, id)!;
  }

  get(userId: string, eventId: string): LifeEvent | null {
    return this.getById(userId, eventId);
  }

  update(userId: string, id: string, input: UpdateLifeEventInput): LifeEvent | null {
    const existing = this.getById(userId, id);
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
    return this.getById(userId, id);
  }

  softDelete(userId: string, id: string): boolean {
    // Verify ownership via getById
    const existing = this.getById(userId, id);
    if (!existing) return false;

    const result = this.db.prepare(`
      UPDATE life_events SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  restore(userId: string, id: string): LifeEvent {
    // Find the deleted life event and verify ownership through contact
    const row = this.db.prepare(
      `SELECT le.* FROM life_events le
       JOIN contacts c ON le.contact_id = c.id
       WHERE le.id = ? AND le.deleted_at IS NOT NULL AND c.user_id = ?`
    ).get(id, userId) as any;

    if (!row) {
      throw new Error('Life event not found or not deleted');
    }

    this.db.prepare(`
      UPDATE life_events SET deleted_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return this.getById(userId, id)!;
  }

  listByContact(userId: string, contactId: string, options: ListLifeEventsOptions = {}): PaginatedResult<LifeEvent> {
    // Verify the contact belongs to the user
    this.verifyContactOwnership(userId, contactId);

    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const deletedFilter = options.include_deleted ? '' : 'AND deleted_at IS NULL';

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM life_events WHERE contact_id = ? ${deletedFilter}`
    ).get(contactId) as any;

    const rows = this.db.prepare(
      `SELECT * FROM life_events WHERE contact_id = ? ${deletedFilter} ORDER BY occurred_at DESC, created_at DESC LIMIT ? OFFSET ?`
    ).all(contactId, perPage, offset) as any[];

    const data = rows.map((row) => ({
      ...row,
      related_contacts: this.getRelatedContacts(row.id),
    }));

    return { data, total: countResult.count, page, per_page: perPage };
  }

  private verifyContactOwnership(userId: string, contactId: string): void {
    const contact = this.db.prepare(
      'SELECT id FROM contacts WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(contactId, userId) as any;
    if (!contact) {
      throw new Error('Contact not found');
    }
  }

  private getById(userId: string, id: string): LifeEvent | null {
    const row = this.db.prepare(
      `SELECT le.* FROM life_events le
       JOIN contacts c ON le.contact_id = c.id
       WHERE le.id = ? AND le.deleted_at IS NULL AND c.deleted_at IS NULL AND c.user_id = ?`
    ).get(id, userId) as any;
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
