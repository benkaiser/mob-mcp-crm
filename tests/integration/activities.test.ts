import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ActivityService, ActivityTypeService } from '../../src/services/activities.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ActivityService', () => {
  let db: Database.Database;
  let service: ActivityService;
  let userId: string;
  let contactA: string;
  let contactB: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ActivityService(db);
    userId = createTestUser(db);
    contactA = createTestContact(db, userId, { firstName: 'Alice' });
    contactB = createTestContact(db, userId, { firstName: 'Bob' });
  });

  afterEach(() => closeDatabase(db));

  it('should create an activity with participants', () => {
    const activity = service.create(userId, {
      type: 'phone_call',
      title: 'Catch-up call',
      description: 'Talked about weekend plans',
      occurred_at: '2024-06-15T10:00:00Z',
      duration_minutes: 30,
      participant_contact_ids: [contactA],
    });

    expect(activity.id).toBeDefined();
    expect(activity.type).toBe('phone_call');
    expect(activity.title).toBe('Catch-up call');
    expect(activity.description).toBe('Talked about weekend plans');
    expect(activity.duration_minutes).toBe(30);
    expect(activity.participants).toEqual([contactA]);
  });

  it('should create an activity with multiple participants', () => {
    const activity = service.create(userId, {
      type: 'in_person',
      title: 'Group lunch',
      occurred_at: '2024-06-15T12:00:00Z',
      location: 'Downtown Cafe',
      participant_contact_ids: [contactA, contactB],
    });

    expect(activity.location).toBe('Downtown Cafe');
    expect(activity.participants).toHaveLength(2);
    expect(activity.participants).toContain(contactA);
    expect(activity.participants).toContain(contactB);
  });

  it('should get an activity by ID', () => {
    const created = service.create(userId, {
      type: 'email',
      occurred_at: '2024-06-15T09:00:00Z',
      participant_contact_ids: [contactA],
    });

    const fetched = service.get(userId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.type).toBe('email');
    expect(fetched!.participants).toEqual([contactA]);
  });

  it('should return null for non-existent activity', () => {
    expect(service.get(userId, 'nonexistent')).toBeNull();
  });

  it('should update an activity', () => {
    const activity = service.create(userId, {
      type: 'phone_call',
      title: 'Old title',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });

    const updated = service.update(userId, activity.id, {
      title: 'New title',
      type: 'video_call',
      duration_minutes: 45,
    });

    expect(updated!.title).toBe('New title');
    expect(updated!.type).toBe('video_call');
    expect(updated!.duration_minutes).toBe(45);
    expect(updated!.participants).toEqual([contactA]);
  });

  it('should update participants', () => {
    const activity = service.create(userId, {
      type: 'in_person',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });

    const updated = service.update(userId, activity.id, {
      participant_contact_ids: [contactA, contactB],
    });

    expect(updated!.participants).toHaveLength(2);
    expect(updated!.participants).toContain(contactB);
  });

  it('should return null when updating non-existent activity', () => {
    expect(service.update(userId, 'nonexistent', { title: 'test' })).toBeNull();
  });

  it('should soft-delete an activity', () => {
    const activity = service.create(userId, {
      type: 'phone_call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });

    expect(service.softDelete(userId, activity.id)).toBe(true);
    expect(service.get(userId, activity.id)).toBeNull();
  });

  it('should return false when deleting non-existent activity', () => {
    expect(service.softDelete(userId, 'nonexistent')).toBe(false);
  });

  it('should list activities for a user', () => {
    service.create(userId, {
      type: 'phone_call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });
    service.create(userId, {
      type: 'email',
      occurred_at: '2024-06-16T10:00:00Z',
      participant_contact_ids: [contactB],
    });

    const result = service.list(userId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it('should filter activities by contact', () => {
    service.create(userId, {
      type: 'phone_call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });
    service.create(userId, {
      type: 'email',
      occurred_at: '2024-06-16T10:00:00Z',
      participant_contact_ids: [contactB],
    });

    const result = service.list(userId, { contact_id: contactA });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('phone_call');
  });

  it('should filter activities by type', () => {
    service.create(userId, {
      type: 'phone_call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });
    service.create(userId, {
      type: 'email',
      occurred_at: '2024-06-16T10:00:00Z',
      participant_contact_ids: [contactA],
    });

    const result = service.list(userId, { type: 'email' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('email');
  });

  it('should paginate activities', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, {
        type: 'phone_call',
        occurred_at: `2024-06-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        participant_contact_ids: [contactA],
      });
    }

    const page1 = service.list(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = service.list(userId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('should exclude soft-deleted activities from list', () => {
    const a = service.create(userId, {
      type: 'phone_call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });
    service.create(userId, {
      type: 'email',
      occurred_at: '2024-06-16T10:00:00Z',
      participant_contact_ids: [contactA],
    });

    service.softDelete(userId, a.id);
    const result = service.list(userId);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should order activities by occurred_at descending', () => {
    service.create(userId, {
      type: 'phone_call',
      title: 'Older',
      occurred_at: '2024-06-01T10:00:00Z',
      participant_contact_ids: [contactA],
    });
    service.create(userId, {
      type: 'email',
      title: 'Newer',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactA],
    });

    const result = service.list(userId);
    expect(result.data[0].title).toBe('Newer');
    expect(result.data[1].title).toBe('Older');
  });

  describe('restore', () => {
    it('should restore a soft-deleted activity', () => {
      const activity = service.create(userId, {
        type: 'phone_call',
        title: 'Restorable',
        occurred_at: '2024-06-15T10:00:00Z',
        participant_contact_ids: [contactA],
      });
      service.softDelete(userId, activity.id);

      expect(service.get(userId, activity.id)).toBeNull();

      const restored = service.restore(userId, activity.id);
      expect(restored.id).toBe(activity.id);
      expect(restored.title).toBe('Restorable');
      expect(restored.deleted_at).toBeNull();

      expect(service.get(userId, activity.id)).not.toBeNull();
    });

    it('should throw error when restoring non-existent activity', () => {
      expect(() => service.restore(userId, 'nonexistent')).toThrow('Activity not found or not deleted');
    });

    it('should throw error when restoring an activity that is not deleted', () => {
      const activity = service.create(userId, {
        type: 'phone_call',
        occurred_at: '2024-06-15T10:00:00Z',
        participant_contact_ids: [contactA],
      });
      expect(() => service.restore(userId, activity.id)).toThrow('Activity not found or not deleted');
    });

    it('should not restore activities belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherContact = createTestContact(db, otherUserId);
      const otherService = new ActivityService(db);
      const activity = otherService.create(otherUserId, {
        type: 'phone_call',
        occurred_at: '2024-06-15T10:00:00Z',
        participant_contact_ids: [otherContact],
      });
      otherService.softDelete(otherUserId, activity.id);

      expect(() => service.restore(userId, activity.id)).toThrow('Activity not found or not deleted');
    });
  });

  describe('list with include_deleted', () => {
    it('should include soft-deleted activities when include_deleted is true', () => {
      const activity = service.create(userId, {
        type: 'phone_call',
        occurred_at: '2024-06-15T10:00:00Z',
        participant_contact_ids: [contactA],
      });
      service.create(userId, {
        type: 'email',
        occurred_at: '2024-06-16T10:00:00Z',
        participant_contact_ids: [contactA],
      });
      service.softDelete(userId, activity.id);

      const withDeleted = service.list(userId, { include_deleted: true });
      expect(withDeleted.total).toBe(2);

      const withoutDeleted = service.list(userId);
      expect(withoutDeleted.total).toBe(1);
    });
  });
});

describe('ActivityTypeService', () => {
  let db: Database.Database;
  let service: ActivityTypeService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ActivityTypeService(db);
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  it('should create a custom activity type', () => {
    const type = service.create(userId, 'Board Game Night', 'Games', '🎲');
    expect(type.name).toBe('Board Game Night');
    expect(type.category).toBe('Games');
    expect(type.icon).toBe('🎲');
    expect(type.user_id).toBe(userId);
  });

  it('should list activity types sorted by category and name', () => {
    service.create(userId, 'Yoga', 'Sports');
    service.create(userId, 'Coffee', 'Food & Drink');
    service.create(userId, 'Tennis', 'Sports');

    const types = service.list(userId);
    expect(types).toHaveLength(3);
    expect(types[0].name).toBe('Coffee');
    expect(types[1].name).toBe('Tennis');
    expect(types[2].name).toBe('Yoga');
  });

  it('should create activity type without category or icon', () => {
    const type = service.create(userId, 'Custom');
    expect(type.name).toBe('Custom');
    expect(type.category).toBeNull();
    expect(type.icon).toBeNull();
  });

  describe('update', () => {
    it('should update an activity type name', () => {
      const type = service.create(userId, 'Old Name', 'Sports', '⚽');
      const updated = service.update(userId, type.id, { name: 'New Name' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
      expect(updated!.category).toBe('Sports');
      expect(updated!.icon).toBe('⚽');
    });

    it('should update an activity type category and icon', () => {
      const type = service.create(userId, 'Tennis', 'Sports', '🎾');
      const updated = service.update(userId, type.id, { category: 'Racket Sports', icon: '🏸' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Tennis');
      expect(updated!.category).toBe('Racket Sports');
      expect(updated!.icon).toBe('🏸');
    });

    it('should return null when updating non-existent activity type', () => {
      expect(service.update(userId, 'nonexistent', { name: 'test' })).toBeNull();
    });

    it('should not update activity types belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherService = new ActivityTypeService(db);
      const type = otherService.create(otherUserId, 'Other Type');

      expect(service.update(userId, type.id, { name: 'Hijacked' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an activity type', () => {
      const type = service.create(userId, 'To Delete');
      const result = service.delete(userId, type.id);
      expect(result.deleted).toBe(true);
      expect(result.warning).toBeUndefined();

      const types = service.list(userId);
      expect(types).toHaveLength(0);
    });

    it('should return deleted false for non-existent activity type', () => {
      const result = service.delete(userId, 'nonexistent');
      expect(result.deleted).toBe(false);
    });

    it('should not delete activity types belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherService = new ActivityTypeService(db);
      const type = otherService.create(otherUserId, 'Other Type');

      const result = service.delete(userId, type.id);
      expect(result.deleted).toBe(false);

      const otherTypes = otherService.list(otherUserId);
      expect(otherTypes).toHaveLength(1);
    });

    it('should return warning when activities use the deleted type', () => {
      const type = service.create(userId, 'Used Type');
      const contactId = createTestContact(db, userId, { firstName: 'Charlie' });
      const activityService = new ActivityService(db);
      activityService.create(userId, {
        type: 'activity',
        occurred_at: '2024-06-15T10:00:00Z',
        activity_type_id: type.id,
        participant_contact_ids: [contactId],
      });

      const result = service.delete(userId, type.id);
      expect(result.deleted).toBe(true);
      expect(result.warning).toBe('1 activity was using this type and has been unlinked');
    });

    it('should unlink activities when type is deleted (ON DELETE SET NULL)', () => {
      const type = service.create(userId, 'Will Delete');
      const contactId = createTestContact(db, userId, { firstName: 'Dana' });
      const activityService = new ActivityService(db);
      const activity = activityService.create(userId, {
        type: 'activity',
        occurred_at: '2024-06-15T10:00:00Z',
        activity_type_id: type.id,
        participant_contact_ids: [contactId],
      });

      service.delete(userId, type.id);

      const fetched = activityService.get(userId, activity.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.activity_type_id).toBeNull();
    });
  });
});
