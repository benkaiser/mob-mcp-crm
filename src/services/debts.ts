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
  include_deleted?: boolean;
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

  create(userId: string, input: CreateDebtInput): Debt {
    // Verify the contact belongs to the user
    this.verifyContactOwnership(userId, input.contact_id);

    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO debts (id, contact_id, amount, currency, direction, reason, incurred_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.contact_id, input.amount, input.currency ?? 'USD',
      input.direction, input.reason ?? null, input.incurred_at ?? null, now, now);

    return this.getById(userId, id)!;
  }

  get(userId: string, id: string): Debt | null {
    return this.getById(userId, id);
  }

  update(userId: string, id: string, input: UpdateDebtInput): Debt | null {
    const existing = this.getById(userId, id);
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

    return this.getById(userId, id);
  }

  settle(userId: string, id: string): Debt | null {
    const existing = this.getById(userId, id);
    if (!existing) return null;

    this.db.prepare(`
      UPDATE debts SET status = 'settled', settled_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);

    return this.getById(userId, id);
  }

  softDelete(userId: string, id: string): boolean {
    // Verify ownership via getById
    const existing = this.getById(userId, id);
    if (!existing) return false;

    const result = this.db.prepare(`
      UPDATE debts SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return result.changes > 0;
  }

  restore(userId: string, id: string): Debt {
    // Find the deleted debt and verify ownership through contact
    const row = this.db.prepare(
      `SELECT d.* FROM debts d
       JOIN contacts c ON d.contact_id = c.id
       WHERE d.id = ? AND d.deleted_at IS NOT NULL AND c.user_id = ?`
    ).get(id, userId) as any;

    if (!row) {
      throw new Error('Debt not found or not deleted');
    }

    this.db.prepare(`
      UPDATE debts SET deleted_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return this.getById(userId, id)!;
  }

  list(userId: string, options: ListDebtsOptions = {}): PaginatedResult<Debt> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const conditions: string[] = ['c.user_id = ?'];
    const params: any[] = [userId];

    if (!options.include_deleted) {
      conditions.push('d.deleted_at IS NULL');
    }
    conditions.push('c.deleted_at IS NULL');

    if (options.contact_id) {
      conditions.push('d.contact_id = ?');
      params.push(options.contact_id);
    }
    if (options.status) {
      conditions.push('d.status = ?');
      params.push(options.status);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = this.db.prepare(
      `SELECT COUNT(*) as count FROM debts d JOIN contacts c ON d.contact_id = c.id WHERE ${whereClause}`
    ).get(...params) as any;

    const rows = this.db.prepare(
      `SELECT d.* FROM debts d JOIN contacts c ON d.contact_id = c.id WHERE ${whereClause} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, perPage, offset) as any[];

    return { data: rows, total: countResult.count, page, per_page: perPage };
  }

  /**
   * Get net balance summary per contact (grouped by currency).
   */
  summary(userId: string, contactId: string): DebtSummary[] {
    // Verify the contact belongs to the user
    this.verifyContactOwnership(userId, contactId);

    const rows = this.db.prepare(`
      SELECT
        d.contact_id,
        d.currency,
        SUM(CASE WHEN d.direction = 'i_owe_them' THEN d.amount ELSE 0 END) as total_i_owe,
        SUM(CASE WHEN d.direction = 'they_owe_me' THEN d.amount ELSE 0 END) as total_they_owe
      FROM debts d
      JOIN contacts c ON d.contact_id = c.id
      WHERE d.contact_id = ? AND d.deleted_at IS NULL AND d.status = 'active'
        AND c.deleted_at IS NULL AND c.user_id = ?
      GROUP BY d.currency
    `).all(contactId, userId) as any[];

    return rows.map((r) => ({
      contact_id: r.contact_id,
      total_i_owe: r.total_i_owe,
      total_they_owe: r.total_they_owe,
      net_balance: r.total_they_owe - r.total_i_owe,
      currency: r.currency,
    }));
  }

  private verifyContactOwnership(userId: string, contactId: string): void {
    const contact = this.db.prepare(
      'SELECT id FROM contacts WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
    ).get(contactId, userId) as any;
    if (!contact) {
      throw new Error('Contact not found');
    }
  }

  private getById(userId: string, id: string): Debt | null {
    const row = this.db.prepare(
      `SELECT d.* FROM debts d
       JOIN contacts c ON d.contact_id = c.id
       WHERE d.id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND c.user_id = ?`
    ).get(id, userId) as any;
    return row ?? null;
  }
}
