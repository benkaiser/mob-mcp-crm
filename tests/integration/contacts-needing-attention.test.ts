import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactService } from '../../src/services/contacts.js';
import { ActivityService } from '../../src/services/activities.js';
import { TagService } from '../../src/services/tags-groups.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ContactService.getContactsNeedingAttention', () => {
  let db: Database.Database;
  let contactService: ContactService;
  let activityService: ActivityService;
  let tagService: TagService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    contactService = new ContactService(db);
    activityService = new ActivityService(db);
    tagService = new TagService(db);
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  function daysAgo(days: number): string {
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  it('should find contacts with no recent interactions', () => {
    const contactId = createTestContact(db, userId, { firstName: 'Alice' });
    // Create an activity 60 days ago
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Old call',
      occurred_at: daysAgo(60),
      participant_contact_ids: [contactId],
    });

    const result = contactService.getContactsNeedingAttention(userId, { days_since_last_interaction: 30 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Alice Doe');
    expect(result.data[0].days_since_interaction).toBeGreaterThanOrEqual(59);
  });

  it('should exclude contacts with recent interactions', () => {
    const contactId = createTestContact(db, userId, { firstName: 'Recent' });
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Recent call',
      occurred_at: daysAgo(5),
      participant_contact_ids: [contactId],
    });

    const result = contactService.getContactsNeedingAttention(userId, { days_since_last_interaction: 30 });
    expect(result.data).toHaveLength(0);
  });

  it('should include contacts with zero interactions', () => {
    createTestContact(db, userId, { firstName: 'NeverContacted' });

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('NeverContacted Doe');
    expect(result.data[0].last_interaction_date).toBeNull();
    expect(result.data[0].total_interactions).toBe(0);
  });

  it('should sort with zero-interaction contacts first, then by staleness', () => {
    const c1 = createTestContact(db, userId, { firstName: 'NeverContacted' });
    const c2 = createTestContact(db, userId, { firstName: 'VeryStale' });
    const c3 = createTestContact(db, userId, { firstName: 'SomewhatStale' });

    activityService.create(userId, {
      type: 'phone_call',
      occurred_at: daysAgo(90),
      participant_contact_ids: [c2],
    });
    activityService.create(userId, {
      type: 'phone_call',
      occurred_at: daysAgo(45),
      participant_contact_ids: [c3],
    });

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data[0].contact_name).toBe('NeverContacted Doe');
    expect(result.data[1].contact_name).toBe('VeryStale Doe');
    expect(result.data[2].contact_name).toBe('SomewhatStale Doe');
  });

  it('should include last interaction details', () => {
    const contactId = createTestContact(db, userId, { firstName: 'Alice' });
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Old call',
      occurred_at: daysAgo(40),
      participant_contact_ids: [contactId],
    });
    activityService.create(userId, {
      type: 'in_person',
      title: 'Most recent meeting',
      occurred_at: daysAgo(35),
      participant_contact_ids: [contactId],
    });

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data[0].last_interaction_type).toBe('in_person');
    expect(result.data[0].last_interaction_title).toBe('Most recent meeting');
    expect(result.data[0].total_interactions).toBe(2);
  });

  it('should filter by tag', () => {
    const c1 = createTestContact(db, userId, { firstName: 'Tagged' });
    const c2 = createTestContact(db, userId, { firstName: 'Untagged' });
    tagService.tagContact(userId, c1, 'close-friends');

    const result = contactService.getContactsNeedingAttention(userId, { tag_name: 'close-friends' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Tagged Doe');
  });

  it('should filter by favorite', () => {
    createTestContact(db, userId, { firstName: 'Fav', isFavorite: true });
    createTestContact(db, userId, { firstName: 'NotFav' });

    const result = contactService.getContactsNeedingAttention(userId, { is_favorite: true });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Fav Doe');
    expect(result.data[0].is_favorite).toBe(true);
  });

  it('should exclude self-contact (is_me = 1)', () => {
    const selfId = createTestContact(db, userId, { firstName: 'Me' });
    db.prepare('UPDATE contacts SET is_me = 1 WHERE id = ?').run(selfId);
    createTestContact(db, userId, { firstName: 'Other' });

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Other Doe');
  });

  it('should exclude deceased contacts', () => {
    createTestContact(db, userId, { firstName: 'Alive' });
    createTestContact(db, userId, { firstName: 'Deceased', status: 'deceased' });

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Alive Doe');
  });

  it('should exclude soft-deleted contacts', () => {
    const c = createTestContact(db, userId, { firstName: 'Deleted' });
    db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(c);

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should respect the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      createTestContact(db, userId, { firstName: `Contact${i}` });
    }

    const result = contactService.getContactsNeedingAttention(userId, { limit: 3 });
    expect(result.data).toHaveLength(3);
  });

  it('should include tags in the response', () => {
    const c = createTestContact(db, userId, { firstName: 'Alice' });
    tagService.tagContact(userId, c, 'friends');
    tagService.tagContact(userId, c, 'work');

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data[0].tags).toContain('friends');
    expect(result.data[0].tags).toContain('work');
  });

  it('should only return contacts for the given user', () => {
    const otherUserId = createTestUser(db, { email: 'other@test.com' });
    createTestContact(db, otherUserId, { firstName: 'OtherUser' });
    createTestContact(db, userId, { firstName: 'MyContact' });

    const result = contactService.getContactsNeedingAttention(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('MyContact Doe');
  });
});
