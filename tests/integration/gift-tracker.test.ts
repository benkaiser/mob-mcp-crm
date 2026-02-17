import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GiftService } from '../../src/services/gifts.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('GiftService.getGiftTracker', () => {
  let db: Database.Database;
  let service: GiftService;
  let userId: string;
  let contactId: string;
  let contactId2: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new GiftService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice', lastName: 'Smith' });
    contactId2 = createTestContact(db, userId, { firstName: 'Bob', lastName: 'Jones' });
  });

  afterEach(() => closeDatabase(db));

  it('should return all gifts across contacts', () => {
    service.create(userId, { contact_id: contactId, name: 'Book', direction: 'giving' });
    service.create(userId, { contact_id: contactId2, name: 'Mug', direction: 'receiving' });

    const result = service.getGiftTracker(userId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should include contact names', () => {
    service.create(userId, { contact_id: contactId, name: 'Book', direction: 'giving' });

    const result = service.getGiftTracker(userId);
    expect(result.data[0].contact_name).toBe('Alice Smith');
    expect(result.data[0].contact_id).toBe(contactId);
  });

  it('should filter by status', () => {
    service.create(userId, { contact_id: contactId, name: 'Idea', direction: 'giving', status: 'idea' });
    service.create(userId, { contact_id: contactId, name: 'Purchased', direction: 'giving', status: 'purchased' });

    const result = service.getGiftTracker(userId, { status: 'idea' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Idea');
  });

  it('should filter by direction', () => {
    service.create(userId, { contact_id: contactId, name: 'Giving', direction: 'giving' });
    service.create(userId, { contact_id: contactId, name: 'Receiving', direction: 'receiving' });

    const result = service.getGiftTracker(userId, { direction: 'giving' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Giving');
  });

  it('should filter by occasion with LIKE matching', () => {
    service.create(userId, { contact_id: contactId, name: 'Gift 1', direction: 'giving', occasion: 'birthday party' });
    service.create(userId, { contact_id: contactId, name: 'Gift 2', direction: 'giving', occasion: 'Christmas' });

    const result = service.getGiftTracker(userId, { occasion: 'birth' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Gift 1');
  });

  it('should compute summary with total estimated cost by currency', () => {
    service.create(userId, { contact_id: contactId, name: 'G1', direction: 'giving', estimated_cost: 50, currency: 'USD' });
    service.create(userId, { contact_id: contactId, name: 'G2', direction: 'giving', estimated_cost: 30, currency: 'USD' });
    service.create(userId, { contact_id: contactId, name: 'G3', direction: 'giving', estimated_cost: 100, currency: 'EUR' });
    service.create(userId, { contact_id: contactId, name: 'G4', direction: 'giving' }); // no cost

    const result = service.getGiftTracker(userId);
    expect(result.summary.total_estimated_cost).toEqual({ USD: 80, EUR: 100 });
  });

  it('should compute summary with count by status', () => {
    service.create(userId, { contact_id: contactId, name: 'G1', direction: 'giving', status: 'idea' });
    service.create(userId, { contact_id: contactId, name: 'G2', direction: 'giving', status: 'idea' });
    service.create(userId, { contact_id: contactId, name: 'G3', direction: 'giving', status: 'purchased' });
    service.create(userId, { contact_id: contactId, name: 'G4', direction: 'giving', status: 'given' });

    const result = service.getGiftTracker(userId);
    expect(result.summary.by_status).toEqual({ idea: 2, purchased: 1, given: 1 });
  });

  it('should sort by estimated_cost', () => {
    service.create(userId, { contact_id: contactId, name: 'Cheap', direction: 'giving', estimated_cost: 10, date: '2025-01-01' });
    service.create(userId, { contact_id: contactId, name: 'Expensive', direction: 'giving', estimated_cost: 100, date: '2025-01-02' });

    const result = service.getGiftTracker(userId, { sort_by: 'estimated_cost', sort_order: 'desc' });
    expect(result.data[0].name).toBe('Expensive');
  });

  it('should paginate results', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, { contact_id: contactId, name: `Gift ${i}`, direction: 'giving' });
    }

    const page1 = service.getGiftTracker(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = service.getGiftTracker(userId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('should exclude soft-deleted gifts', () => {
    const gift = service.create(userId, { contact_id: contactId, name: 'Deleted', direction: 'giving' });
    service.softDelete(userId, gift.id);

    const result = service.getGiftTracker(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should exclude gifts of soft-deleted contacts', () => {
    service.create(userId, { contact_id: contactId, name: 'G1', direction: 'giving' });
    db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(contactId);

    const result = service.getGiftTracker(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should only return gifts for the given user', () => {
    const otherUserId = createTestUser(db, { email: 'other@test.com' });
    const otherContact = createTestContact(db, otherUserId, { firstName: 'Other' });
    service.create(otherUserId, { contact_id: otherContact, name: 'Other Gift', direction: 'giving' });
    service.create(userId, { contact_id: contactId, name: 'My Gift', direction: 'giving' });

    const result = service.getGiftTracker(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('My Gift');
  });

  it('should handle null dates in sorting', () => {
    service.create(userId, { contact_id: contactId, name: 'No Date', direction: 'giving' });
    service.create(userId, { contact_id: contactId, name: 'Has Date', direction: 'giving', date: '2025-06-01' });

    const result = service.getGiftTracker(userId, { sort_by: 'date', sort_order: 'desc' });
    // Has Date should come first, No Date last (NULLS LAST)
    expect(result.data[0].name).toBe('Has Date');
    expect(result.data[1].name).toBe('No Date');
  });
});
