import Database from 'better-sqlite3';

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

  create(input: CreateNoteInput): Note {
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO notes (id, contact_id, title, body, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.title ?? null, input.body, input.is_pinned ? 1 : 0, now, now);

    return this.getById(id)!;
  }

  get(noteId: string): Note | null {
    return this.getById(noteId);
  }

  update(id: string, input: UpdateNoteInput): Note | null {
    const existing = this.getById(id);
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
    return this.getById(id);
  }

  softDelete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE notes SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  listByContact(contactId: string, options: ListNotesOptions = {}): PaginatedResult<Note> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const countResult = this.db.prepare(
      'SELECT COUNT(*) as count FROM notes WHERE contact_id = ? AND deleted_at IS NULL'
    ).get(contactId) as any;

    const rows = this.db.prepare(
      'SELECT * FROM notes WHERE contact_id = ? AND deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?'
    ).all(contactId, perPage, offset) as any[];

    return {
      data: rows.map((r) => this.mapRow(r)),
      total: countResult.count,
      page,
      per_page: perPage,
    };
  }

  private getById(id: string): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: any): Note {
    return { ...row, is_pinned: Boolean(row.is_pinned) };
  }
}
