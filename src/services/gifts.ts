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

  create(input: CreateGiftInput): Gift {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO gifts (id, contact_id, name, description, url, estimated_cost, currency, occasion, status, direction, date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.name, input.description ?? null,
      input.url ?? null, input.estimated_cost ?? null, input.currency ?? 'USD',
      input.occasion ?? null, input.status ?? 'idea', input.direction,
      input.date ?? null, now, now);

    return this.getById(id)!;
  }

  get(id: string): Gift | null {
    return this.getById(id);
  }

  update(id: string, input: UpdateGiftInput): Gift | null {
    const existing = this.getById(id);
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

    return this.getById(id);
  }

  softDelete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE gifts SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  list(options: ListGiftsOptions = {}): PaginatedResult<Gift> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];

    if (options.contact_id) {
      conditions.push('contact_id = ?');
      params.push(options.contact_id);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.direction) {
      conditions.push('direction = ?');
      params.push(options.direction);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM gifts WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT * FROM gifts WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    return { data: rows, total: countResult.count, page, per_page: perPage };
  }

  private getById(id: string): Gift | null {
    const row = this.db.prepare(
      'SELECT * FROM gifts WHERE id = ? AND deleted_at IS NULL'
    ).get(id) as any;
    return row ?? null;
  }
}
