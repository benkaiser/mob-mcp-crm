import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export type DebtDirection = 'i_owe_them' | 'they_owe_me';
export type DebtStatus = 'active' | 'settled';

export interface Debt {
  id: string;
  contact_id: string;
  amount: number;
  currency: string;
  direction: DebtDirection;
  reason: string | null;
  incurred_at: string | null;
  settled_at: string | null;
  status: DebtStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateDebtInput {
  contact_id: string;
  amount: number;
  currency?: string;
  direction: DebtDirection;
  reason?: string;
  incurred_at?: string;
}

export interface UpdateDebtInput {
  amount?: number;
  currency?: string;
  direction?: DebtDirection;
  reason?: string;
  incurred_at?: string;
}

export interface ListDebtsOptions {
  contact_id?: string;
  status?: DebtStatus;
  page?: number;
  per_page?: number;
}

export interface DebtSummary {
  contact_id: string;
  total_i_owe: number;
  total_they_owe: number;
  net_balance: number; // positive = they owe me, negative = I owe them
  currency: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Service ────────────────────────────────────────────────────

export class DebtService {
  constructor(private db: Database.Database) {}

  create(input: CreateDebtInput): Debt {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO debts (id, contact_id, amount, currency, direction, reason, incurred_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.amount, input.currency ?? 'USD',
      input.direction, input.reason ?? null, input.incurred_at ?? null, now, now);

    return this.getById(id)!;
  }

  get(id: string): Debt | null {
    return this.getById(id);
  }

  update(id: string, input: UpdateDebtInput): Debt | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.amount !== undefined) { fields.push('amount = ?'); values.push(input.amount); }
    if (input.currency !== undefined) { fields.push('currency = ?'); values.push(input.currency); }
    if (input.direction !== undefined) { fields.push('direction = ?'); values.push(input.direction); }
    if (input.reason !== undefined) { fields.push('reason = ?'); values.push(input.reason); }
    if (input.incurred_at !== undefined) { fields.push('incurred_at = ?'); values.push(input.incurred_at); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db.prepare(`UPDATE debts SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...values);
    }

    return this.getById(id);
  }

  settle(id: string): Debt | null {
    const existing = this.getById(id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE debts SET status = 'settled', settled_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);

    return this.getById(id);
  }

  softDelete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE debts SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  list(options: ListDebtsOptions = {}): PaginatedResult<Debt> {
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

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM debts WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT * FROM debts WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    return { data: rows, total: countResult.count, page, per_page: perPage };
  }

  /**
   * Get net balance summary per contact (grouped by currency).
   */
  summary(contactId: string): DebtSummary[] {
    const rows = this.db.prepare(`
      SELECT
        contact_id,
        currency,
        SUM(CASE WHEN direction = 'i_owe_them' THEN amount ELSE 0 END) as total_i_owe,
        SUM(CASE WHEN direction = 'they_owe_me' THEN amount ELSE 0 END) as total_they_owe
      FROM debts
      WHERE contact_id = ? AND deleted_at IS NULL AND status = 'active'
      GROUP BY currency
    `).all(contactId) as any[];

    return rows.map((r) => ({
      contact_id: r.contact_id,
      total_i_owe: r.total_i_owe,
      total_they_owe: r.total_they_owe,
      net_balance: r.total_they_owe - r.total_i_owe,
      currency: r.currency,
    }));
  }

  private getById(id: string): Debt | null {
    const row = this.db.prepare(
      'SELECT * FROM debts WHERE id = ? AND deleted_at IS NULL'
    ).get(id) as any;
    return row ?? null;
  }
}
