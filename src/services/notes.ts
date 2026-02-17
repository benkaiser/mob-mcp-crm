import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export interface Note {
  id: string;
  contact_id: string;
  title: string | null;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateNoteInput {
  contact_id: string;
  title?: string;
  body: string;
  is_pinned?: boolean;
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
  is_pinned?: boolean;
}

export interface ListNotesOptions {
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

export class NoteService {
  constructor(private db: Database.Database) {}

  create(userId: string, input: CreateNoteInput): Note {
    // Verify the contact belongs to the user
    this.verifyContactOwnership(userId, input.contact_id);

    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO notes (id, contact_id, title, body, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.title ?? null, input.body, input.is_pinned ? 1 : 0, now, now);

    return this.getById(userId, id)!;
  }

  get(userId: string, noteId: string): Note | null {
    return this.getById(userId, noteId);
  }

  update(userId: string, id: string, input: UpdateNoteInput): Note | null {
    const existing = this.getById(userId, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
    if (input.body !== undefined) { fields.push('body = ?'); values.push(input.body); }
    if (input.is_pinned !== undefined) { fields.push('is_pinned = ?'); values.push(input.is_pinned ? 1 : 0); }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    this.db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...values);
    return this.getById(userId, id);
  }

  softDelete(userId: string, id: string): boolean {
    // Verify ownership via getById
    const existing = this.getById(userId, id);
    if (!existing) return false;

    const result = this.db.prepare(`
      UPDATE notes SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  restore(userId: string, id: string): Note {
    // Find the deleted note and verify ownership through contact
    const row = this.db.prepare(
      `SELECT n.* FROM notes n
       JOIN contacts c ON n.contact_id = c.id
       WHERE n.id = ? AND n.deleted_at IS NOT NULL AND c.user_id = ?`
    ).get(id, userId) as any;

    if (!row) {
      throw new Error('Note not found or not deleted');
    }

    this.db.prepare(`
      UPDATE notes SET deleted_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return this.getById(userId, id)!;
  }

  listByContact(userId: string, contactId: string, options: ListNotesOptions = {}): PaginatedResult<Note> {
    // Verify the contact belongs to the user
    this.verifyContactOwnership(userId, contactId);

    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const deletedFilter = options.include_deleted ? '' : 'AND deleted_at IS NULL';

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM notes WHERE contact_id = ? ${deletedFilter}`
    ).get(contactId) as any;

    const rows = this.db.prepare(
      `SELECT * FROM notes WHERE contact_id = ? ${deletedFilter} ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?`
    ).all(contactId, perPage, offset) as any[];

    return {
      data: rows.map((r) => this.mapRow(r)),
      total: countResult.count,
      page,
      per_page: perPage,
    };
  }

  /**
   * Search notes across all contacts with filtering and sorting.
   */
  searchNotes(userId: string, options: {
    query?: string;
    tag_name?: string;
    contact_id?: string;
    is_pinned?: boolean;
    sort_by?: 'created_at' | 'updated_at';
    sort_order?: 'asc' | 'desc';
    page?: number;
    per_page?: number;
  } = {}): {
    data: Array<{
      id: string;
      title: string | null;
      body: string;
      body_truncated: boolean;
      is_pinned: boolean;
      created_at: string;
      updated_at: string;
      contact_id: string;
      contact_name: string;
    }>;
    total: number;
    page: number;
    per_page: number;
  } {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;
    const sortBy = options.sort_by ?? 'updated_at';
    const sortOrder = options.sort_order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = ['n.deleted_at IS NULL', 'c.deleted_at IS NULL', 'c.user_id = ?'];
    const params: any[] = [userId];

    if (options.query) {
      conditions.push('(n.title LIKE ? OR n.body LIKE ?)');
      const searchTerm = `%${options.query}%`;
      params.push(searchTerm, searchTerm);
    }

    if (options.contact_id) {
      conditions.push('n.contact_id = ?');
      params.push(options.contact_id);
    }

    if (options.is_pinned !== undefined) {
      conditions.push('n.is_pinned = ?');
      params.push(options.is_pinned ? 1 : 0);
    }

    let joinClause = 'JOIN contacts c ON n.contact_id = c.id';
    if (options.tag_name) {
      joinClause += ' JOIN contact_tags ct ON c.id = ct.contact_id JOIN tags t ON ct.tag_id = t.id';
      conditions.push('t.name = ?');
      params.push(options.tag_name);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM notes n ${joinClause} WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT n.*, c.first_name, c.last_name FROM notes n ${joinClause} WHERE ${whereClause} ORDER BY n.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    const BODY_LIMIT = 500;
    const data = rows.map((row) => {
      const bodyTruncated = row.body.length > BODY_LIMIT;
      return {
        id: row.id,
        title: row.title,
        body: bodyTruncated ? row.body.substring(0, BODY_LIMIT) + '...' : row.body,
        body_truncated: bodyTruncated,
        is_pinned: Boolean(row.is_pinned),
        created_at: row.created_at,
        updated_at: row.updated_at,
        contact_id: row.contact_id,
        contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      };
    });

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

  private getById(userId: string, id: string): Note | null {
    const row = this.db.prepare(
      `SELECT n.* FROM notes n
       JOIN contacts c ON n.contact_id = c.id
       WHERE n.id = ? AND n.deleted_at IS NULL AND c.deleted_at IS NULL AND c.user_id = ?`
    ).get(id, userId) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: any): Note {
    return { ...row, is_pinned: Boolean(row.is_pinned) };
  }
}
