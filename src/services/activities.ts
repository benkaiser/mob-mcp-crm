import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export type ActivityInteractionType =
  | 'phone_call' | 'video_call' | 'text_message' | 'in_person' | 'email' | 'activity' | 'other';

export interface Activity {
  id: string;
  user_id: string;
  type: ActivityInteractionType;
  title: string | null;
  description: string | null;
  occurred_at: string;
  duration_minutes: number | null;
  location: string | null;
  activity_type_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  participants?: string[];
}

export interface CreateActivityInput {
  type: ActivityInteractionType;
  title?: string;
  description?: string;
  occurred_at: string;
  duration_minutes?: number;
  location?: string;
  activity_type_id?: string;
  participant_contact_ids: string[];
}

export interface UpdateActivityInput {
  type?: ActivityInteractionType;
  title?: string;
  description?: string;
  occurred_at?: string;
  duration_minutes?: number;
  location?: string;
  activity_type_id?: string;
  participant_contact_ids?: string[];
}

export interface ListActivitiesOptions {
  contact_id?: string;
  type?: ActivityInteractionType;
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

export interface ActivityType {
  id: string;
  user_id: string;
  name: string;
  category: string | null;
  icon: string | null;
  created_at: string;
}

// ─── Activity Service ───────────────────────────────────────────

export class ActivityService {
  constructor(private db: Database.Database) {}

  create(userId: string, input: CreateActivityInput): Activity {
    const id = generateId();
    const now = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO activities (id, user_id, type, title, description, occurred_at, duration_minutes, location, activity_type_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, input.type, input.title ?? null, input.description ?? null,
        input.occurred_at, input.duration_minutes ?? null, input.location ?? null,
        input.activity_type_id ?? null, now, now);

      const participantStmt = this.db.prepare(
        'INSERT INTO activity_participants (activity_id, contact_id) VALUES (?, ?)'
      );
      for (const contactId of input.participant_contact_ids) {
        participantStmt.run(id, contactId);
      }
    });

    transaction();
    return this.get(userId, id)!;
  }

  get(userId: string, activityId: string): Activity | null {
    const row = this.db.prepare(
      'SELECT * FROM activities WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(activityId, userId) as any;
    if (!row) return null;

    const participants = this.getParticipants(activityId);
    return { ...row, participants };
  }

  update(userId: string, activityId: string, input: UpdateActivityInput): Activity | null {
    const existing = this.get(userId, activityId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.type !== undefined) { fields.push('type = ?'); values.push(input.type); }
    if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.occurred_at !== undefined) { fields.push('occurred_at = ?'); values.push(input.occurred_at); }
    if (input.duration_minutes !== undefined) { fields.push('duration_minutes = ?'); values.push(input.duration_minutes); }
    if (input.location !== undefined) { fields.push('location = ?'); values.push(input.location); }
    if (input.activity_type_id !== undefined) { fields.push('activity_type_id = ?'); values.push(input.activity_type_id); }

    const transaction = this.db.transaction(() => {
      if (fields.length > 0) {
        fields.push("updated_at = datetime('now')");
        values.push(activityId, userId);
        this.db.prepare(`UPDATE activities SET ${fields.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).run(...values);
      }

      if (input.participant_contact_ids !== undefined) {
        this.db.prepare('DELETE FROM activity_participants WHERE activity_id = ?').run(activityId);
        const stmt = this.db.prepare('INSERT INTO activity_participants (activity_id, contact_id) VALUES (?, ?)');
        for (const contactId of input.participant_contact_ids) {
          stmt.run(activityId, contactId);
        }
      }
    });

    transaction();
    return this.get(userId, activityId);
  }

  softDelete(userId: string, activityId: string): boolean {
    const result = this.db.prepare(`
      UPDATE activities SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL
    `).run(activityId, userId);
    return result.changes > 0;
  }

  restore(userId: string, activityId: string): Activity {
    const row = this.db.prepare(
      'SELECT * FROM activities WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL'
    ).get(activityId, userId) as any;

    if (!row) {
      throw new Error('Activity not found or not deleted');
    }

    this.db.prepare(`
      UPDATE activities SET deleted_at = NULL, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(activityId, userId);

    return this.get(userId, activityId)!;
  }

  list(userId: string, options: ListActivitiesOptions = {}): PaginatedResult<Activity> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['a.user_id = ?'];
    const params: any[] = [userId];

    if (!options.include_deleted) {
      conditions.push('a.deleted_at IS NULL');
    }

    if (options.contact_id) {
      conditions.push('a.id IN (SELECT activity_id FROM activity_participants WHERE contact_id = ?)');
      params.push(options.contact_id);
    }
    if (options.type) {
      conditions.push('a.type = ?');
      params.push(options.type);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM activities a WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT a.* FROM activities a WHERE ${whereClause} ORDER BY a.occurred_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    const data = rows.map((row) => ({
      ...row,
      participants: this.getParticipants(row.id),
    }));

    return { data, total: countResult.count, page, per_page: perPage };
  }

  batchCreate(userId: string, inputs: CreateActivityInput[]): Activity[] {
    if (inputs.length > 50) {
      throw new Error('Batch size exceeds maximum of 50 items');
    }

    const results: Activity[] = [];

    const transaction = this.db.transaction(() => {
      for (let i = 0; i < inputs.length; i++) {
        try {
          const activity = this.create(userId, inputs[i]);
          results.push(activity);
        } catch (err: any) {
          throw new Error(`Failed to create activity at index ${i}: ${err.message}`);
        }
      }
    });

    transaction();
    return results;
  }

  private getParticipants(activityId: string): string[] {
    const rows = this.db.prepare(
      'SELECT contact_id FROM activity_participants WHERE activity_id = ?'
    ).all(activityId) as any[];
    return rows.map((r) => r.contact_id);
  }

  /**
   * Get a cross-contact activity log with participant names.
   */
  getActivityLog(userId: string, options: {
    type?: ActivityInteractionType;
    days_back?: number;
    since?: string;
    contact_id?: string;
    sort_order?: 'asc' | 'desc';
    page?: number;
    per_page?: number;
  } = {}): {
    data: Array<{
      id: string;
      type: string;
      title: string | null;
      description: string | null;
      occurred_at: string;
      duration_minutes: number | null;
      location: string | null;
      participants: Array<{ contact_id: string; contact_name: string }>;
    }>;
    total: number;
    page: number;
    per_page: number;
  } {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;
    const sortOrder = options.sort_order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = ['a.user_id = ?', 'a.deleted_at IS NULL'];
    const params: any[] = [userId];

    // Date filter
    if (options.since) {
      conditions.push('a.occurred_at >= ?');
      params.push(options.since);
    } else {
      const daysBack = options.days_back ?? 7;
      const sinceDate = new Date(Date.now() - daysBack * 86400000).toISOString();
      conditions.push('a.occurred_at >= ?');
      params.push(sinceDate);
    }

    if (options.type) {
      conditions.push('a.type = ?');
      params.push(options.type);
    }

    if (options.contact_id) {
      conditions.push('a.id IN (SELECT activity_id FROM activity_participants WHERE contact_id = ?)');
      params.push(options.contact_id);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM activities a WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT a.* FROM activities a WHERE ${whereClause} ORDER BY a.occurred_at ${sortOrder} LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    // Get participant names for each activity
    const participantStmt = this.db.prepare(`
      SELECT ap.contact_id, c.first_name, c.last_name
      FROM activity_participants ap
      JOIN contacts c ON ap.contact_id = c.id
      WHERE ap.activity_id = ?
    `);

    const data = rows.map((row) => {
      const participantRows = participantStmt.all(row.id) as any[];
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        occurred_at: row.occurred_at,
        duration_minutes: row.duration_minutes,
        location: row.location,
        participants: participantRows.map((p) => ({
          contact_id: p.contact_id,
          contact_name: [p.first_name, p.last_name].filter(Boolean).join(' '),
        })),
      };
    });

    return { data, total: countResult.count, page, per_page: perPage };
  }
}

// ─── Activity Type Service ──────────────────────────────────────

export interface UpdateActivityTypeInput {
  name?: string;
  category?: string;
  icon?: string;
}

export class ActivityTypeService {
  constructor(private db: Database.Database) {}

  create(userId: string, name: string, category?: string, icon?: string): ActivityType {
    const id = generateId();
    this.db.prepare(`
      INSERT INTO activity_types (id, user_id, name, category, icon)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, name, category ?? null, icon ?? null);

    return this.db.prepare('SELECT * FROM activity_types WHERE id = ?').get(id) as ActivityType;
  }

  list(userId: string): ActivityType[] {
    return this.db.prepare(
      'SELECT * FROM activity_types WHERE user_id = ? ORDER BY category, name'
    ).all(userId) as ActivityType[];
  }

  update(userId: string, typeId: string, input: UpdateActivityTypeInput): ActivityType | null {
    const existing = this.db.prepare(
      'SELECT * FROM activity_types WHERE id = ? AND user_id = ?'
    ).get(typeId, userId) as ActivityType | undefined;
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.category !== undefined) { fields.push('category = ?'); values.push(input.category); }
    if (input.icon !== undefined) { fields.push('icon = ?'); values.push(input.icon); }

    if (fields.length > 0) {
      values.push(typeId, userId);
      this.db.prepare(
        `UPDATE activity_types SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
      ).run(...values);
    }

    return this.db.prepare('SELECT * FROM activity_types WHERE id = ?').get(typeId) as ActivityType;
  }

  delete(userId: string, typeId: string): { deleted: boolean; warning?: string } {
    const existing = this.db.prepare(
      'SELECT * FROM activity_types WHERE id = ? AND user_id = ?'
    ).get(typeId, userId) as ActivityType | undefined;
    if (!existing) return { deleted: false };

    const usageCount = (this.db.prepare(
      'SELECT COUNT(*) as count FROM activities WHERE activity_type_id = ? AND user_id = ?'
    ).get(typeId, userId) as any).count;

    this.db.prepare(
      'DELETE FROM activity_types WHERE id = ? AND user_id = ?'
    ).run(typeId, userId);

    const result: { deleted: boolean; warning?: string } = { deleted: true };
    if (usageCount > 0) {
      result.warning = `${usageCount} activit${usageCount === 1 ? 'y was' : 'ies were'} using this type and ${usageCount === 1 ? 'has' : 'have'} been unlinked`;
    }
    return result;
  }
}
