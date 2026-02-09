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
});
