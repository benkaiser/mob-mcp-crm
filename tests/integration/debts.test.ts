import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DebtService } from '../../src/services/debts.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('DebtService', () => {
  let db: Database.Database;
  let service: DebtService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new DebtService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice' });
  });

  afterEach(() => closeDatabase(db));

  it('should create a debt (I owe them)', () => {
    const debt = service.create({
      contact_id: contactId,
      amount: 50,
      direction: 'i_owe_them',
      reason: 'Lunch',
      incurred_at: '2024-06-15',
    });

    expect(debt.id).toBeDefined();
    expect(debt.contact_id).toBe(contactId);
    expect(debt.amount).toBe(50);
    expect(debt.currency).toBe('USD');
    expect(debt.direction).toBe('i_owe_them');
    expect(debt.reason).toBe('Lunch');
    expect(debt.incurred_at).toBe('2024-06-15');
    expect(debt.status).toBe('active');
    expect(debt.settled_at).toBeNull();
  });

  it('should create a debt (they owe me)', () => {
    const debt = service.create({
      contact_id: contactId,
      amount: 100,
      direction: 'they_owe_me',
      reason: 'Concert tickets',
    });

    expect(debt.direction).toBe('they_owe_me');
  });

  it('should get a debt by ID', () => {
    const created = service.create({
      contact_id: contactId,
      amount: 25,
      direction: 'i_owe_them',
    });

    const fetched = service.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('should return null for non-existent debt', () => {
    expect(service.get('nonexistent')).toBeNull();
  });

  it('should update a debt', () => {
    const debt = service.create({
      contact_id: contactId,
      amount: 50,
      direction: 'i_owe_them',
    });

    const updated = service.update(debt.id, {
      amount: 75,
      reason: 'Updated reason',
    });

    expect(updated!.amount).toBe(75);
    expect(updated!.reason).toBe('Updated reason');
  });

  it('should return null when updating non-existent debt', () => {
    expect(service.update('nonexistent', { amount: 100 })).toBeNull();
  });

  it('should settle a debt', () => {
    const debt = service.create({
      contact_id: contactId,
      amount: 50,
      direction: 'i_owe_them',
    });

    const settled = service.settle(debt.id);
    expect(settled!.status).toBe('settled');
    expect(settled!.settled_at).not.toBeNull();
  });

  it('should return null when settling non-existent debt', () => {
    expect(service.settle('nonexistent')).toBeNull();
  });

  it('should soft-delete a debt', () => {
    const debt = service.create({
      contact_id: contactId,
      amount: 50,
      direction: 'i_owe_them',
    });

    expect(service.softDelete(debt.id)).toBe(true);
    expect(service.get(debt.id)).toBeNull();
  });

  it('should return false when deleting non-existent debt', () => {
    expect(service.softDelete('nonexistent')).toBe(false);
  });

  it('should list debts', () => {
    service.create({ contact_id: contactId, amount: 50, direction: 'i_owe_them' });
    service.create({ contact_id: contactId, amount: 30, direction: 'they_owe_me' });

    const result = service.list();
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should filter debts by contact', () => {
    const contactB = createTestContact(db, userId, { firstName: 'Bob' });
    service.create({ contact_id: contactId, amount: 50, direction: 'i_owe_them' });
    service.create({ contact_id: contactB, amount: 30, direction: 'i_owe_them' });

    const result = service.list({ contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].amount).toBe(50);
  });

  it('should filter debts by status', () => {
    const debt = service.create({ contact_id: contactId, amount: 50, direction: 'i_owe_them' });
    service.create({ contact_id: contactId, amount: 30, direction: 'i_owe_them' });
    service.settle(debt.id);

    const activeResult = service.list({ status: 'active' });
    expect(activeResult.data).toHaveLength(1);
    expect(activeResult.data[0].amount).toBe(30);

    const settledResult = service.list({ status: 'settled' });
    expect(settledResult.data).toHaveLength(1);
    expect(settledResult.data[0].amount).toBe(50);
  });

  it('should exclude soft-deleted debts', () => {
    const debt = service.create({ contact_id: contactId, amount: 50, direction: 'i_owe_them' });
    service.create({ contact_id: contactId, amount: 30, direction: 'i_owe_them' });

    service.softDelete(debt.id);
    const result = service.list();
    expect(result.data).toHaveLength(1);
  });

  it('should calculate net balance summary', () => {
    service.create({ contact_id: contactId, amount: 100, direction: 'i_owe_them' });
    service.create({ contact_id: contactId, amount: 50, direction: 'they_owe_me' });
    service.create({ contact_id: contactId, amount: 30, direction: 'they_owe_me' });

    const summary = service.summary(contactId);
    expect(summary).toHaveLength(1);
    expect(summary[0].total_i_owe).toBe(100);
    expect(summary[0].total_they_owe).toBe(80);
    expect(summary[0].net_balance).toBe(-20); // I owe them net $20
    expect(summary[0].currency).toBe('USD');
  });

  it('should group summary by currency', () => {
    service.create({ contact_id: contactId, amount: 100, direction: 'i_owe_them', currency: 'USD' });
    service.create({ contact_id: contactId, amount: 50, direction: 'they_owe_me', currency: 'EUR' });

    const summary = service.summary(contactId);
    expect(summary).toHaveLength(2);
  });

  it('should exclude settled debts from summary', () => {
    const debt = service.create({ contact_id: contactId, amount: 100, direction: 'i_owe_them' });
    service.create({ contact_id: contactId, amount: 50, direction: 'they_owe_me' });
    service.settle(debt.id);

    const summary = service.summary(contactId);
    expect(summary).toHaveLength(1);
    expect(summary[0].total_i_owe).toBe(0);
    expect(summary[0].total_they_owe).toBe(50);
    expect(summary[0].net_balance).toBe(50);
  });

  it('should return empty summary for contact with no debts', () => {
    const summary = service.summary(contactId);
    expect(summary).toHaveLength(0);
  });

  it('should paginate debts', () => {
    for (let i = 0; i < 5; i++) {
      service.create({ contact_id: contactId, amount: 10 * (i + 1), direction: 'i_owe_them' });
    }

    const page1 = service.list({ page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });

  it('should use custom currency', () => {
    const debt = service.create({
      contact_id: contactId,
      amount: 50,
      direction: 'i_owe_them',
      currency: 'GBP',
    });

    expect(debt.currency).toBe('GBP');
  });
});
