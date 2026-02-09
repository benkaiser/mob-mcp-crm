import Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateTaskInput {
  contact_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: TaskPriority;
}

export interface UpdateTaskInput {
  contact_id?: string | null;
  title?: string;
  description?: string;
  due_date?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
}

export interface ListTasksOptions {
  contact_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
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

export class TaskService {
  constructor(private db: Database.Database) {}

  create(userId: string, input: CreateTaskInput): Task {
    const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO tasks (id, user_id, contact_id, title, description, due_date, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, input.contact_id ?? null, input.title,
      input.description ?? null, input.due_date ?? null,
      input.priority ?? 'medium', now, now);

    return this.getById(userId, id)!;
  }

  get(userId: string, id: string): Task | null {
    return this.getById(userId, id);
  }

  update(userId: string, id: string, input: UpdateTaskInput): Task | null {
    const existing = this.getById(userId, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.contact_id !== undefined) { fields.push('contact_id = ?'); values.push(input.contact_id); }
    if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.due_date !== undefined) { fields.push('due_date = ?'); values.push(input.due_date); }
    if (input.priority !== undefined) { fields.push('priority = ?'); values.push(input.priority); }
    if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id, userId);
      this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).run(...values);
    }

    return this.getById(userId, id);
  }

  complete(userId: string, id: string): Task | null {
    const existing = this.getById(userId, id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE tasks SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(id, userId);

    return this.getById(userId, id);
  }

  softDelete(userId: string, id: string): boolean {
    const result = this.db.prepare(`
      UPDATE tasks SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(id, userId);
    return result.changes > 0;
  }

  list(userId: string, options: ListTasksOptions = {}): PaginatedResult<Task> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['user_id = ?', 'deleted_at IS NULL'];
    const params: any[] = [userId];

    if (options.contact_id) {
      conditions.push('contact_id = ?');
      params.push(options.contact_id);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.priority) {
      conditions.push('priority = ?');
      params.push(options.priority);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT * FROM tasks WHERE ${whereClause} ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
        due_date ASC NULLS LAST,
        created_at DESC
      LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    return { data: rows, total: countResult.count, page, per_page: perPage };
  }

  private getById(userId: string, id: string): Task | null {
    const row = this.db.prepare(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(id, userId) as any;
    return row ?? null;
  }
}
