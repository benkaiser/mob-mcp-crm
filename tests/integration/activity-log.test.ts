import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ActivityService } from '../../src/services/activities.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ActivityService.getActivityLog', () => {
  let db: Database.Database;
  let service: ActivityService;
  let userId: string;
  let contactId: string;
  let contactId2: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ActivityService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice', lastName: 'Smith' });
    contactId2 = createTestContact(db, userId, { firstName: 'Bob', lastName: 'Jones' });
  });

  afterEach(() => closeDatabase(db));

  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  it('should return activities within the default 7-day window', () => {
    service.create(userId, {
      type: 'phone_call',
      title: 'Recent call',
      occurred_at: daysAgo(3),
      participant_contact_ids: [contactId],
    });
    service.create(userId, {
      type: 'in_person',
      title: 'Old meeting',
      occurred_at: daysAgo(30),
      participant_contact_ids: [contactId2],
    });

    const result = service.getActivityLog(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Recent call');
  });

  it('should filter by activity type', () => {
    service.create(userId, {
      type: 'phone_call',
      title: 'Call',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId],
    });
    service.create(userId, {
      type: 'email',
      title: 'Email',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId],
    });

    const result = service.getActivityLog(userId, { type: 'phone_call' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Call');
  });

  it('should include participant names', () => {
    service.create(userId, {
      type: 'in_person',
      title: 'Group dinner',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId, contactId2],
    });

    const result = service.getActivityLog(userId);
    expect(result.data[0].participants).toHaveLength(2);
    const names = result.data[0].participants.map(p => p.contact_name);
    expect(names).toContain('Alice Smith');
    expect(names).toContain('Bob Jones');
  });

  it('should use custom days_back', () => {
    service.create(userId, {
      type: 'phone_call',
      title: '20 days ago',
      occurred_at: daysAgo(20),
      participant_contact_ids: [contactId],
    });

    const narrow = service.getActivityLog(userId, { days_back: 10 });
    expect(narrow.data).toHaveLength(0);

    const wide = service.getActivityLog(userId, { days_back: 25 });
    expect(wide.data).toHaveLength(1);
  });

  it('should use since date when provided', () => {
    service.create(userId, {
      type: 'phone_call',
      title: 'Recent',
      occurred_at: daysAgo(5),
      participant_contact_ids: [contactId],
    });
    service.create(userId, {
      type: 'phone_call',
      title: 'Old',
      occurred_at: daysAgo(20),
      participant_contact_ids: [contactId],
    });

    const result = service.getActivityLog(userId, { since: daysAgo(10) });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Recent');
  });

  it('should filter by contact_id', () => {
    service.create(userId, {
      type: 'phone_call',
      title: 'With Alice',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId],
    });
    service.create(userId, {
      type: 'phone_call',
      title: 'With Bob',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId2],
    });

    const result = service.getActivityLog(userId, { contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('With Alice');
  });

  it('should sort ascending when requested', () => {
    service.create(userId, {
      type: 'phone_call',
      title: 'Earlier',
      occurred_at: daysAgo(3),
      participant_contact_ids: [contactId],
    });
    service.create(userId, {
      type: 'phone_call',
      title: 'Later',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId],
    });

    const result = service.getActivityLog(userId, { sort_order: 'asc' });
    expect(result.data[0].title).toBe('Earlier');
    expect(result.data[1].title).toBe('Later');
  });

  it('should paginate results', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, {
        type: 'phone_call',
        title: `Activity ${i}`,
        occurred_at: daysAgo(i),
        participant_contact_ids: [contactId],
      });
    }

    const page1 = service.getActivityLog(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = service.getActivityLog(userId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('should exclude soft-deleted activities', () => {
    const activity = service.create(userId, {
      type: 'phone_call',
      title: 'Deleted',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId],
    });
    service.softDelete(userId, activity.id);

    const result = service.getActivityLog(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should only return activities for the given user', () => {
    const otherUserId = createTestUser(db, { email: 'other@test.com' });
    const otherContact = createTestContact(db, otherUserId, { firstName: 'Other' });
    service.create(otherUserId, {
      type: 'phone_call',
      title: 'Other',
      occurred_at: daysAgo(1),
      participant_contact_ids: [otherContact],
    });
    service.create(userId, {
      type: 'phone_call',
      title: 'Mine',
      occurred_at: daysAgo(1),
      participant_contact_ids: [contactId],
    });

    const result = service.getActivityLog(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Mine');
  });
});
