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
    const gift = service.create(userId, {
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
    const gift = service.create(userId, {
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
    const created = service.create(userId, {
      contact_id: contactId,
      name: 'Test Gift',
      direction: 'giving',
    });

    const fetched = service.get(userId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('should return null for non-existent gift', () => {
    expect(service.get(userId, 'nonexistent')).toBeNull();
  });

  it('should update a gift', () => {
    const gift = service.create(userId, {
      contact_id: contactId,
      name: 'Old Name',
      direction: 'giving',
    });

    const updated = service.update(userId, gift.id, {
      name: 'New Name',
      status: 'purchased',
      estimated_cost: 29.99,
    });

    expect(updated!.name).toBe('New Name');
    expect(updated!.status).toBe('purchased');
    expect(updated!.estimated_cost).toBe(29.99);
  });

  it('should return null when updating non-existent gift', () => {
    expect(service.update(userId, 'nonexistent', { name: 'test' })).toBeNull();
  });

  it('should track the full gift lifecycle', () => {
    const gift = service.create(userId, {
      contact_id: contactId,
      name: 'Headphones',
      direction: 'giving',
      status: 'idea',
    });

    // idea → planned
    const planned = service.update(userId, gift.id, { status: 'planned' });
    expect(planned!.status).toBe('planned');

    // planned → purchased
    const purchased = service.update(userId, gift.id, { status: 'purchased', estimated_cost: 199.99 });
    expect(purchased!.status).toBe('purchased');

    // purchased → given
    const given = service.update(userId, gift.id, { status: 'given', date: '2024-12-25' });
    expect(given!.status).toBe('given');
    expect(given!.date).toBe('2024-12-25');
  });

  it('should soft-delete a gift', () => {
    const gift = service.create(userId, {
      contact_id: contactId,
      name: 'To delete',
      direction: 'giving',
    });

    expect(service.softDelete(userId, gift.id)).toBe(true);
    expect(service.get(userId, gift.id)).toBeNull();
  });

  it('should return false when deleting non-existent gift', () => {
    expect(service.softDelete(userId, 'nonexistent')).toBe(false);
  });

  it('should list gifts', () => {
    service.create(userId, { contact_id: contactId, name: 'G1', direction: 'giving' });
    service.create(userId, { contact_id: contactId, name: 'G2', direction: 'receiving' });

    const result = service.list(userId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should filter gifts by contact', () => {
    const contactB = createTestContact(db, userId, { firstName: 'Bob' });
    service.create(userId, { contact_id: contactId, name: 'Alice Gift', direction: 'giving' });
    service.create(userId, { contact_id: contactB, name: 'Bob Gift', direction: 'giving' });

    const result = service.list(userId, { contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Alice Gift');
  });

  it('should filter gifts by status', () => {
    service.create(userId, { contact_id: contactId, name: 'Idea', direction: 'giving', status: 'idea' });
    service.create(userId, { contact_id: contactId, name: 'Purchased', direction: 'giving', status: 'purchased' });

    const result = service.list(userId, { status: 'idea' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Idea');
  });

  it('should filter gifts by direction', () => {
    service.create(userId, { contact_id: contactId, name: 'Giving', direction: 'giving' });
    service.create(userId, { contact_id: contactId, name: 'Receiving', direction: 'receiving' });

    const result = service.list(userId, { direction: 'giving' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Giving');
  });

  it('should exclude soft-deleted gifts from list', () => {
    const gift = service.create(userId, { contact_id: contactId, name: 'Deleted', direction: 'giving' });
    service.create(userId, { contact_id: contactId, name: 'Kept', direction: 'giving' });

    service.softDelete(userId, gift.id);
    const result = service.list(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Kept');
  });

  it('should paginate gifts', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, { contact_id: contactId, name: `Gift ${i}`, direction: 'giving' });
    }

    const page1 = service.list(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });

  it('should use custom currency', () => {
    const gift = service.create(userId, {
      contact_id: contactId,
      name: 'Euro gift',
      direction: 'giving',
      currency: 'EUR',
      estimated_cost: 50,
    });

    expect(gift.currency).toBe('EUR');
  });

  describe('restore', () => {
    it('should restore a soft-deleted gift', () => {
      const gift = service.create(userId, {
        contact_id: contactId,
        name: 'Restorable gift',
        direction: 'giving',
      });
      service.softDelete(userId, gift.id);

      expect(service.get(userId, gift.id)).toBeNull();

      const restored = service.restore(userId, gift.id);
      expect(restored.id).toBe(gift.id);
      expect(restored.name).toBe('Restorable gift');
      expect(restored.deleted_at).toBeNull();

      expect(service.get(userId, gift.id)).not.toBeNull();
    });

    it('should throw error when restoring non-existent gift', () => {
      expect(() => service.restore(userId, 'nonexistent')).toThrow('Gift not found or not deleted');
    });

    it('should throw error when restoring a gift that is not deleted', () => {
      const gift = service.create(userId, {
        contact_id: contactId,
        name: 'Active gift',
        direction: 'giving',
      });
      expect(() => service.restore(userId, gift.id)).toThrow('Gift not found or not deleted');
    });

    it('should not restore gifts belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherContactId = createTestContact(db, otherUserId);
      const otherService = new GiftService(db);
      const gift = otherService.create(otherUserId, {
        contact_id: otherContactId,
        name: 'Other gift',
        direction: 'giving',
      });
      otherService.softDelete(otherUserId, gift.id);

      expect(() => service.restore(userId, gift.id)).toThrow('Gift not found or not deleted');
    });
  });

  describe('list with include_deleted', () => {
    it('should include soft-deleted gifts when include_deleted is true', () => {
      const gift = service.create(userId, { contact_id: contactId, name: 'Deleted', direction: 'giving' });
      service.create(userId, { contact_id: contactId, name: 'Kept', direction: 'giving' });
      service.softDelete(userId, gift.id);

      const withDeleted = service.list(userId, { include_deleted: true });
      expect(withDeleted.total).toBe(2);

      const withoutDeleted = service.list(userId);
      expect(withoutDeleted.total).toBe(1);
    });
  });
});
