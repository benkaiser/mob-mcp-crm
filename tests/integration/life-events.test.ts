import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { LifeEventService } from '../../src/services/life-events.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('LifeEventService', () => {
  let db: Database.Database;
  let service: LifeEventService;
  let userId: string;
  let contactId: string;
  let contactB: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new LifeEventService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice' });
    contactB = createTestContact(db, userId, { firstName: 'Bob' });
  });

  afterEach(() => closeDatabase(db));

  it('should create a life event', () => {
    const event = service.create(userId, {
      contact_id: contactId,
      event_type: 'new_job',
      title: 'Started at Google',
      description: 'Software Engineer role',
      occurred_at: '2024-03-01',
    });

    expect(event.id).toBeDefined();
    expect(event.contact_id).toBe(contactId);
    expect(event.event_type).toBe('new_job');
    expect(event.title).toBe('Started at Google');
    expect(event.description).toBe('Software Engineer role');
    expect(event.occurred_at).toBe('2024-03-01');
    expect(event.related_contacts).toEqual([]);
  });

  it('should create a life event with related contacts', () => {
    const event = service.create(userId, {
      contact_id: contactId,
      event_type: 'got_married',
      title: 'Married Bob',
      occurred_at: '2024-06-15',
      related_contact_ids: [contactB],
    });

    expect(event.related_contacts).toEqual([contactB]);
  });

  it('should get a life event by ID', () => {
    const created = service.create(userId, {
      contact_id: contactId,
      event_type: 'moved',
      title: 'Moved to Berlin',
    });

    const fetched = service.get(userId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.title).toBe('Moved to Berlin');
  });

  it('should return null for non-existent life event', () => {
    expect(service.get(userId, 'nonexistent')).toBeNull();
  });

  it('should update a life event', () => {
    const event = service.create(userId, {
      contact_id: contactId,
      event_type: 'new_job',
      title: 'Old Title',
    });

    const updated = service.update(userId, event.id, {
      title: 'New Title',
      event_type: 'promotion',
      description: 'Got promoted!',
    });

    expect(updated!.title).toBe('New Title');
    expect(updated!.event_type).toBe('promotion');
    expect(updated!.description).toBe('Got promoted!');
  });

  it('should update related contacts', () => {
    const event = service.create(userId, {
      contact_id: contactId,
      event_type: 'got_married',
      title: 'Marriage',
      related_contact_ids: [contactB],
    });

    const updated = service.update(userId, event.id, {
      related_contact_ids: [], // remove all related contacts
    });

    expect(updated!.related_contacts).toEqual([]);
  });

  it('should return null when updating non-existent event', () => {
    expect(service.update(userId, 'nonexistent', { title: 'test' })).toBeNull();
  });

  it('should soft-delete a life event', () => {
    const event = service.create(userId, {
      contact_id: contactId,
      event_type: 'moved',
      title: 'Moved',
    });

    expect(service.softDelete(userId, event.id)).toBe(true);
    expect(service.get(userId, event.id)).toBeNull();
  });

  it('should return false when deleting non-existent event', () => {
    expect(service.softDelete(userId, 'nonexistent')).toBe(false);
  });

  it('should list life events by contact', () => {
    service.create(userId, {
      contact_id: contactId,
      event_type: 'new_job',
      title: 'Job 1',
      occurred_at: '2024-01-01',
    });
    service.create(userId, {
      contact_id: contactId,
      event_type: 'moved',
      title: 'Moved',
      occurred_at: '2024-06-01',
    });

    const result = service.listByContact(userId, contactId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it('should order life events by occurred_at descending', () => {
    service.create(userId, {
      contact_id: contactId,
      event_type: 'new_job',
      title: 'Earlier',
      occurred_at: '2024-01-01',
    });
    service.create(userId, {
      contact_id: contactId,
      event_type: 'moved',
      title: 'Later',
      occurred_at: '2024-06-01',
    });

    const result = service.listByContact(userId, contactId);
    expect(result.data[0].title).toBe('Later');
    expect(result.data[1].title).toBe('Earlier');
  });

  it('should exclude soft-deleted events from list', () => {
    const event = service.create(userId, {
      contact_id: contactId,
      event_type: 'new_job',
      title: 'Deleted',
    });
    service.create(userId, {
      contact_id: contactId,
      event_type: 'moved',
      title: 'Kept',
    });

    service.softDelete(userId, event.id);
    const result = service.listByContact(userId, contactId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Kept');
  });

  it('should paginate life events', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, {
        contact_id: contactId,
        event_type: 'milestone',
        title: `Event ${i}`,
        occurred_at: `2024-0${i + 1}-01`,
      });
    }

    const page1 = service.listByContact(userId, contactId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = service.listByContact(userId, contactId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('should create event without optional fields', () => {
    const event = service.create(userId, {
      contact_id: contactId,
      event_type: 'other',
      title: 'Minimal event',
    });

    expect(event.description).toBeNull();
    expect(event.occurred_at).toBeNull();
    expect(event.related_contacts).toEqual([]);
  });

  describe('restore', () => {
    it('should restore a soft-deleted life event', () => {
      const event = service.create(userId, {
        contact_id: contactId,
        event_type: 'new_job',
        title: 'Restorable event',
      });
      service.softDelete(userId, event.id);

      expect(service.get(userId, event.id)).toBeNull();

      const restored = service.restore(userId, event.id);
      expect(restored.id).toBe(event.id);
      expect(restored.title).toBe('Restorable event');
      expect(restored.deleted_at).toBeNull();

      expect(service.get(userId, event.id)).not.toBeNull();
    });

    it('should throw error when restoring non-existent life event', () => {
      expect(() => service.restore(userId, 'nonexistent')).toThrow('Life event not found or not deleted');
    });

    it('should throw error when restoring a life event that is not deleted', () => {
      const event = service.create(userId, {
        contact_id: contactId,
        event_type: 'moved',
        title: 'Active event',
      });
      expect(() => service.restore(userId, event.id)).toThrow('Life event not found or not deleted');
    });

    it('should not restore life events belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherContactId = createTestContact(db, otherUserId);
      const otherService = new LifeEventService(db);
      const event = otherService.create(otherUserId, {
        contact_id: otherContactId,
        event_type: 'moved',
        title: 'Other event',
      });
      otherService.softDelete(otherUserId, event.id);

      expect(() => service.restore(userId, event.id)).toThrow('Life event not found or not deleted');
    });
  });

  describe('listByContact with include_deleted', () => {
    it('should include soft-deleted life events when include_deleted is true', () => {
      const event = service.create(userId, {
        contact_id: contactId,
        event_type: 'new_job',
        title: 'Deleted',
      });
      service.create(userId, {
        contact_id: contactId,
        event_type: 'moved',
        title: 'Kept',
      });
      service.softDelete(userId, event.id);

      const withDeleted = service.listByContact(userId, contactId, { include_deleted: true });
      expect(withDeleted.total).toBe(2);

      const withoutDeleted = service.listByContact(userId, contactId);
      expect(withoutDeleted.total).toBe(1);
    });
  });
});
