import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GiftService } from '../../src/services/gifts.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('GiftService', () => {
  let db: Database.Database;
  let service: GiftService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new GiftService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice' });
  });

  afterEach(() => closeDatabase(db));

  it('should create a gift idea', () => {
    const gift = service.create({
      contact_id: contactId,
      name: 'Book on TypeScript',
      description: 'Programming TypeScript by Boris Cherny',
      url: 'https://example.com/book',
      estimated_cost: 45.99,
      occasion: 'Birthday',
      direction: 'giving',
    });

    expect(gift.id).toBeDefined();
    expect(gift.contact_id).toBe(contactId);
    expect(gift.name).toBe('Book on TypeScript');
    expect(gift.description).toBe('Programming TypeScript by Boris Cherny');
    expect(gift.url).toBe('https://example.com/book');
    expect(gift.estimated_cost).toBe(45.99);
    expect(gift.currency).toBe('USD');
    expect(gift.occasion).toBe('Birthday');
    expect(gift.status).toBe('idea');
    expect(gift.direction).toBe('giving');
  });

  it('should create a received gift', () => {
    const gift = service.create({
      contact_id: contactId,
      name: 'Coffee mug',
      direction: 'receiving',
      status: 'received',
      date: '2024-12-25',
    });

    expect(gift.direction).toBe('receiving');
    expect(gift.status).toBe('received');
    expect(gift.date).toBe('2024-12-25');
  });

  it('should get a gift by ID', () => {
    const created = service.create({
      contact_id: contactId,
      name: 'Test Gift',
      direction: 'giving',
    });

    const fetched = service.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('should return null for non-existent gift', () => {
    expect(service.get('nonexistent')).toBeNull();
  });

  it('should update a gift', () => {
    const gift = service.create({
      contact_id: contactId,
      name: 'Old Name',
      direction: 'giving',
    });

    const updated = service.update(gift.id, {
      name: 'New Name',
      status: 'purchased',
      estimated_cost: 29.99,
    });

    expect(updated!.name).toBe('New Name');
    expect(updated!.status).toBe('purchased');
    expect(updated!.estimated_cost).toBe(29.99);
  });

  it('should return null when updating non-existent gift', () => {
    expect(service.update('nonexistent', { name: 'test' })).toBeNull();
  });

  it('should track the full gift lifecycle', () => {
    const gift = service.create({
      contact_id: contactId,
      name: 'Headphones',
      direction: 'giving',
      status: 'idea',
    });

    // idea → planned
    const planned = service.update(gift.id, { status: 'planned' });
    expect(planned!.status).toBe('planned');

    // planned → purchased
    const purchased = service.update(gift.id, { status: 'purchased', estimated_cost: 199.99 });
    expect(purchased!.status).toBe('purchased');

    // purchased → given
    const given = service.update(gift.id, { status: 'given', date: '2024-12-25' });
    expect(given!.status).toBe('given');
    expect(given!.date).toBe('2024-12-25');
  });

  it('should soft-delete a gift', () => {
    const gift = service.create({
      contact_id: contactId,
      name: 'To delete',
      direction: 'giving',
    });

    expect(service.softDelete(gift.id)).toBe(true);
    expect(service.get(gift.id)).toBeNull();
  });

  it('should return false when deleting non-existent gift', () => {
    expect(service.softDelete('nonexistent')).toBe(false);
  });

  it('should list gifts', () => {
    service.create({ contact_id: contactId, name: 'G1', direction: 'giving' });
    service.create({ contact_id: contactId, name: 'G2', direction: 'receiving' });

    const result = service.list();
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should filter gifts by contact', () => {
    const contactB = createTestContact(db, userId, { firstName: 'Bob' });
    service.create({ contact_id: contactId, name: 'Alice Gift', direction: 'giving' });
    service.create({ contact_id: contactB, name: 'Bob Gift', direction: 'giving' });

    const result = service.list({ contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Alice Gift');
  });

  it('should filter gifts by status', () => {
    service.create({ contact_id: contactId, name: 'Idea', direction: 'giving', status: 'idea' });
    service.create({ contact_id: contactId, name: 'Purchased', direction: 'giving', status: 'purchased' });

    const result = service.list({ status: 'idea' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Idea');
  });

  it('should filter gifts by direction', () => {
    service.create({ contact_id: contactId, name: 'Giving', direction: 'giving' });
    service.create({ contact_id: contactId, name: 'Receiving', direction: 'receiving' });

    const result = service.list({ direction: 'giving' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Giving');
  });

  it('should exclude soft-deleted gifts from list', () => {
    const gift = service.create({ contact_id: contactId, name: 'Deleted', direction: 'giving' });
    service.create({ contact_id: contactId, name: 'Kept', direction: 'giving' });

    service.softDelete(gift.id);
    const result = service.list();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Kept');
  });

  it('should paginate gifts', () => {
    for (let i = 0; i < 5; i++) {
      service.create({ contact_id: contactId, name: `Gift ${i}`, direction: 'giving' });
    }

    const page1 = service.list({ page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });

  it('should use custom currency', () => {
    const gift = service.create({
      contact_id: contactId,
      name: 'Euro gift',
      direction: 'giving',
      currency: 'EUR',
      estimated_cost: 50,
    });

    expect(gift.currency).toBe('EUR');
  });
});
