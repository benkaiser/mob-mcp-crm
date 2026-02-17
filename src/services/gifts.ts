import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export type GiftStatus = 'idea' | 'planned' | 'purchased' | 'given' | 'received';
export type GiftDirection = 'giving' | 'receiving';

export interface Gift {
  id: string;
  contact_id: string;
  name: string;
  description: string | null;
  url: string | null;
  estimated_cost: number | null;
  currency: string;
  occasion: string | null;
  status: GiftStatus;
  direction: GiftDirection;
  date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateGiftInput {
  contact_id: string;
  name: string;
  description?: string;
  url?: string;
  estimated_cost?: number;
  currency?: string;
  occasion?: string;
  status?: GiftStatus;
  direction: GiftDirection;
  date?: string;
}

export interface UpdateGiftInput {
  name?: string;
  description?: string;
  url?: string;
  estimated_cost?: number;
  currency?: string;
  occasion?: string;
  status?: GiftStatus;
  direction?: GiftDirection;
  date?: string;
}

export interface ListGiftsOptions {
  contact_id?: string;
  status?: GiftStatus;
  direction?: GiftDirection;
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

export class GiftService {
  constructor(private db: Database.Database) {}

  create(userId: string, input: CreateGiftInput): Gift {
    // Verify the contact belongs to the user
    this.verifyContactOwnership(userId, input.contact_id);

    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO gifts (id, contact_id, name, description, url, estimated_cost, currency, occasion, status, direction, date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.name, input.description ?? null,
      input.url ?? null, input.estimated_cost ?? null, input.currency ?? 'USD',
      input.occasion ?? null, input.status ?? 'idea', input.direction,
      input.date ?? null, now, now);

    return this.getById(userId, id)!;
  }

  get(userId: string, id: string): Gift | null {
    return this.getById(userId, id);
  }

  update(userId: string, id: string, input: UpdateGiftInput): Gift | null {
    const existing = this.getById(userId, id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.url !== undefined) { fields.push('url = ?'); values.push(input.url); }
    if (input.estimated_cost !== undefined) { fields.push('estimated_cost = ?'); values.push(input.estimated_cost); }
    if (input.currency !== undefined) { fields.push('currency = ?'); values.push(input.currency); }
    if (input.occasion !== undefined) { fields.push('occasion = ?'); values.push(input.occasion); }
    if (input.status !== undefined) { fields.push('status = ?'); values.push(input.status); }
    if (input.direction !== undefined) { fields.push('direction = ?'); values.push(input.direction); }
    if (input.date !== undefined) { fields.push('date = ?'); values.push(input.date); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db.prepare(`UPDATE gifts SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...values);
    }

    return this.getById(userId, id);
  }

  softDelete(userId: string, id: string): boolean {
    // Verify ownership via getById
    const existing = this.getById(userId, id);
    if (!existing) return false;

    const result = this.db.prepare(`
      UPDATE gifts SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  restore(userId: string, id: string): Gift {
    // Find the deleted gift and verify ownership through contact
    const row = this.db.prepare(
      `SELECT g.* FROM gifts g
       JOIN contacts c ON g.contact_id = c.id
       WHERE g.id = ? AND g.deleted_at IS NOT NULL AND c.user_id = ?`
    ).get(id, userId) as any;

    if (!row) {
      throw new Error('Gift not found or not deleted');
    }

    this.db.prepare(`
      UPDATE gifts SET deleted_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return this.getById(userId, id)!;
  }

  list(userId: string, options: ListGiftsOptions = {}): PaginatedResult<Gift> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['c.user_id = ?'];
    const params: any[] = [userId];

    if (!options.include_deleted) {
      conditions.push('g.deleted_at IS NULL');
    }
    conditions.push('c.deleted_at IS NULL');

    if (options.contact_id) {
      conditions.push('g.contact_id = ?');
      params.push(options.contact_id);
    }
    if (options.status) {
      conditions.push('g.status = ?');
      params.push(options.status);
    }
    if (options.direction) {
      conditions.push('g.direction = ?');
      params.push(options.direction);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM gifts g JOIN contacts c ON g.contact_id = c.id WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT g.* FROM gifts g JOIN contacts c ON g.contact_id = c.id WHERE ${whereClause} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    return { data: rows, total: countResult.count, page, per_page: perPage };
  }

  private verifyContactOwnership(userId: string, contactId: string): void {
    const contact = this.db.prepare(
      'SELECT id FROM contacts WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(contactId, userId) as any;
    if (!contact) {
      throw new Error('Contact not found');
    }
  }

  private getById(userId: string, id: string): Gift | null {
    const row = this.db.prepare(
      `SELECT g.* FROM gifts g
       JOIN contacts c ON g.contact_id = c.id
       WHERE g.id = ? AND g.deleted_at IS NULL AND c.deleted_at IS NULL AND c.user_id = ?`
    ).get(id, userId) as any;
    return row ?? null;
  }

  /**
   * Cross-contact gift tracker with summary aggregation.
   */
  getGiftTracker(userId: string, options: {
    status?: GiftStatus;
    direction?: GiftDirection;
    occasion?: string;
    sort_by?: 'date' | 'created_at' | 'estimated_cost';
    sort_order?: 'asc' | 'desc';
    page?: number;
    per_page?: number;
  } = {}): {
    data: Array<{
      id: string;
      name: string;
      description: string | null;
      url: string | null;
      estimated_cost: number | null;
      currency: string;
      occasion: string | null;
      status: string;
      direction: string;
      date: string | null;
      contact_id: string;
      contact_name: string;
    }>;
    total: number;
    page: number;
    per_page: number;
    summary: {
      total_estimated_cost: Record<string, number>;
      by_status: Record<string, number>;
    };
  } {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;
    const sortOrder = options.sort_order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = ['g.deleted_at IS NULL', 'c.deleted_at IS NULL', 'c.user_id = ?'];
    const params: any[] = [userId];

    if (options.status) {
      conditions.push('g.status = ?');
      params.push(options.status);
    }
    if (options.direction) {
      conditions.push('g.direction = ?');
      params.push(options.direction);
    }
    if (options.occasion) {
      conditions.push('g.occasion LIKE ?');
      params.push(`%${options.occasion}%`);
    }

    const whereClause = conditions.join(' AND ');

    // Sort
    let orderBy: string;
    switch (options.sort_by) {
      case 'estimated_cost':
        orderBy = `g.estimated_cost ${sortOrder} NULLS LAST`;
        break;
      case 'created_at':
        orderBy = `g.created_at ${sortOrder}`;
        break;
      case 'date':
      default:
        orderBy = `g.date ${sortOrder} NULLS LAST, g.created_at ${sortOrder}`;
        break;
    }

    // Count
    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM gifts g JOIN contacts c ON g.contact_id = c.id WHERE ${whereClause}`
    ).get(...params) as any;

    // Data
    const rows = this.db.prepare(
      `SELECT g.*, c.first_name, c.last_name FROM gifts g JOIN contacts c ON g.contact_id = c.id WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      url: row.url,
      estimated_cost: row.estimated_cost,
      currency: row.currency,
      occasion: row.occasion,
      status: row.status,
      direction: row.direction,
      date: row.date,
      contact_id: row.contact_id,
      contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
    }));

    // Summary aggregation (across ALL matching, not just current page)
    const summaryRows = this.db.prepare(
      `SELECT g.currency, g.status, g.estimated_cost FROM gifts g JOIN contacts c ON g.contact_id = c.id WHERE ${whereClause}`
    ).all(...params) as any[];

    const totalEstimatedCost: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const row of summaryRows) {
      if (row.estimated_cost) {
        totalEstimatedCost[row.currency] = (totalEstimatedCost[row.currency] ?? 0) + row.estimated_cost;
      }
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }

    return {
      data,
      total: countResult.count,
      page,
      per_page: perPage,
      summary: { total_estimated_cost: totalEstimatedCost, by_status: byStatus },
    };
  }
}
