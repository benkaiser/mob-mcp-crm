import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactService } from '../../src/services/contacts.js';
import { TagService } from '../../src/services/tags-groups.js';
import { ActivityService } from '../../src/services/activities.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('Batch Operations', () => {
  let db: Database.Database;
  let userId: string;
  let contactService: ContactService;
  let tagService: TagService;
  let activityService: ActivityService;

  beforeEach(() => {
    db = createTestDatabase();
    contactService = new ContactService(db);
    tagService = new TagService(db);
    activityService = new ActivityService(db);
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  // ─── batch_create_contacts ────────────────────────────────────

  describe('ContactService.batchCreate', () => {
    it('should create multiple contacts in one call', () => {
      const created = contactService.batchCreate(userId, [
        { first_name: 'Sarah', last_name: 'Connor' },
        { first_name: 'Mike', last_name: 'Johnson' },
        { first_name: 'Lisa', last_name: 'Park' },
      ]);

      expect(created).toHaveLength(3);
      expect(created[0].first_name).toBe('Sarah');
      expect(created[0].last_name).toBe('Connor');
      expect(created[0].id).toBeDefined();
      expect(created[1].first_name).toBe('Mike');
      expect(created[2].first_name).toBe('Lisa');
    });

    it('should return all created records with IDs', () => {
      const created = contactService.batchCreate(userId, [
        { first_name: 'Alice', company: 'Acme' },
        { first_name: 'Bob', job_title: 'Engineer' },
      ]);

      expect(created[0].id).toBeDefined();
      expect(created[0].company).toBe('Acme');
      expect(created[1].id).toBeDefined();
      expect(created[1].job_title).toBe('Engineer');

      // Verify they are retrievable
      const alice = contactService.get(userId, created[0].id);
      expect(alice).not.toBeNull();
      expect(alice!.first_name).toBe('Alice');
    });

    it('should handle a single item batch', () => {
      const created = contactService.batchCreate(userId, [
        { first_name: 'Solo' },
      ]);

      expect(created).toHaveLength(1);
      expect(created[0].first_name).toBe('Solo');
    });

    it('should handle an empty array', () => {
      const created = contactService.batchCreate(userId, []);
      expect(created).toHaveLength(0);
    });

    it('should reject batches exceeding 50 items', () => {
      const inputs = Array.from({ length: 51 }, (_, i) => ({
        first_name: `Contact${i}`,
      }));

      expect(() => contactService.batchCreate(userId, inputs)).toThrow(
        'Batch size exceeds maximum of 50 items'
      );
    });

    it('should roll back all contacts on failure', () => {
      const initialList = contactService.list(userId);
      const initialCount = initialList.total;

      // The second contact references a non-existent met_through_contact_id,
      // which will cause a foreign key error
      expect(() => contactService.batchCreate(userId, [
        { first_name: 'Good' },
        { first_name: 'Bad', met_through_contact_id: 'nonexistent-id-that-will-fail-fk' },
      ])).toThrow();

      // Verify no contacts were created (transaction rolled back)
      const afterList = contactService.list(userId);
      expect(afterList.total).toBe(initialCount);
    });

    it('should create contacts with full fields', () => {
      const created = contactService.batchCreate(userId, [
        {
          first_name: 'Alice',
          last_name: 'Smith',
          nickname: 'Ali',
          company: 'Acme Corp',
          job_title: 'Engineer',
          is_favorite: true,
          met_at_location: 'Conference',
        },
        {
          first_name: 'Bob',
          last_name: 'Brown',
          status: 'active',
          industry: 'Tech',
        },
      ]);

      expect(created[0].nickname).toBe('Ali');
      expect(created[0].company).toBe('Acme Corp');
      expect(created[0].is_favorite).toBe(true);
      expect(created[1].industry).toBe('Tech');
    });
  });

  // ─── batch_tag_contacts ────────────────────────────────────────

  describe('TagService.batchTagContacts', () => {
    let contactA: string;
    let contactB: string;
    let contactC: string;

    beforeEach(() => {
      contactA = createTestContact(db, userId, { firstName: 'Alice' });
      contactB = createTestContact(db, userId, { firstName: 'Bob' });
      contactC = createTestContact(db, userId, { firstName: 'Charlie' });
    });

    it('should tag multiple contacts with the same tag', () => {
      const result = tagService.batchTagContacts(userId, 'conference', [contactA, contactB, contactC]);

      expect(result.tag.name).toBe('conference');
      expect(result.tagged_contact_ids).toHaveLength(3);
      expect(result.tagged_contact_ids).toContain(contactA);
      expect(result.tagged_contact_ids).toContain(contactB);
      expect(result.tagged_contact_ids).toContain(contactC);

      // Verify tags were applied
      const tagsA = tagService.listByContact(contactA);
      expect(tagsA).toHaveLength(1);
      expect(tagsA[0].name).toBe('conference');

      const tagsB = tagService.listByContact(contactB);
      expect(tagsB).toHaveLength(1);
      expect(tagsB[0].name).toBe('conference');
    });

    it('should create the tag if it does not exist', () => {
      const result = tagService.batchTagContacts(userId, 'new-tag', [contactA]);

      expect(result.tag.name).toBe('new-tag');
      expect(result.tag.id).toBeDefined();

      const allTags = tagService.list(userId);
      expect(allTags.some((t) => t.name === 'new-tag')).toBe(true);
    });

    it('should reuse existing tag', () => {
      const existingTag = tagService.create(userId, 'existing');
      const result = tagService.batchTagContacts(userId, 'existing', [contactA, contactB]);

      expect(result.tag.id).toBe(existingTag.id);
    });

    it('should handle tagging with color', () => {
      const result = tagService.batchTagContacts(userId, 'vip', [contactA], '#ff0000');
      expect(result.tag.name).toBe('vip');
    });

    it('should handle a single contact', () => {
      const result = tagService.batchTagContacts(userId, 'solo', [contactA]);
      expect(result.tagged_contact_ids).toHaveLength(1);
    });

    it('should handle an empty array', () => {
      const result = tagService.batchTagContacts(userId, 'empty', []);
      expect(result.tagged_contact_ids).toHaveLength(0);
    });

    it('should reject batches exceeding 50 items', () => {
      const ids = Array.from({ length: 51 }, () => contactA);

      expect(() => tagService.batchTagContacts(userId, 'big', ids)).toThrow(
        'Batch size exceeds maximum of 50 items'
      );
    });

    it('should not duplicate tags when contact is already tagged', () => {
      tagService.tagContact(userId, contactA, 'existing');
      const result = tagService.batchTagContacts(userId, 'existing', [contactA, contactB]);

      expect(result.tagged_contact_ids).toHaveLength(2);

      // Verify no duplicates
      const tagsA = tagService.listByContact(contactA);
      expect(tagsA).toHaveLength(1);
    });
  });

  // ─── batch_create_activities ────────────────────────────────────

  describe('ActivityService.batchCreate', () => {
    let contactA: string;
    let contactB: string;

    beforeEach(() => {
      contactA = createTestContact(db, userId, { firstName: 'Alice' });
      contactB = createTestContact(db, userId, { firstName: 'Bob' });
    });

    it('should create multiple activities in one call', () => {
      const created = activityService.batchCreate(userId, [
        {
          type: 'phone_call',
          title: 'Call with Sarah',
          occurred_at: '2025-01-15T10:00:00Z',
          participant_contact_ids: [contactA],
        },
        {
          type: 'in_person',
          title: 'Coffee with Mike',
          occurred_at: '2025-01-15T14:00:00Z',
          participant_contact_ids: [contactB],
        },
        {
          type: 'email',
          title: 'Follow-up email',
          occurred_at: '2025-01-16T09:00:00Z',
          participant_contact_ids: [contactA, contactB],
        },
      ]);

      expect(created).toHaveLength(3);
      expect(created[0].title).toBe('Call with Sarah');
      expect(created[0].type).toBe('phone_call');
      expect(created[0].id).toBeDefined();
      expect(created[0].participants).toEqual([contactA]);
      expect(created[1].title).toBe('Coffee with Mike');
      expect(created[2].participants).toHaveLength(2);
    });

    it('should return all created records with IDs and participants', () => {
      const created = activityService.batchCreate(userId, [
        {
          type: 'in_person',
          title: 'Group lunch',
          occurred_at: '2025-01-15T12:00:00Z',
          location: 'Downtown',
          duration_minutes: 60,
          participant_contact_ids: [contactA, contactB],
        },
      ]);

      expect(created[0].id).toBeDefined();
      expect(created[0].location).toBe('Downtown');
      expect(created[0].duration_minutes).toBe(60);
      expect(created[0].participants).toContain(contactA);
      expect(created[0].participants).toContain(contactB);

      // Verify it is retrievable
      const fetched = activityService.get(userId, created[0].id);
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('Group lunch');
    });

    it('should handle a single item batch', () => {
      const created = activityService.batchCreate(userId, [
        {
          type: 'phone_call',
          occurred_at: '2025-01-15T10:00:00Z',
          participant_contact_ids: [contactA],
        },
      ]);

      expect(created).toHaveLength(1);
    });

    it('should handle an empty array', () => {
      const created = activityService.batchCreate(userId, []);
      expect(created).toHaveLength(0);
    });

    it('should reject batches exceeding 50 items', () => {
      const inputs = Array.from({ length: 51 }, (_, i) => ({
        type: 'phone_call' as const,
        occurred_at: '2025-01-15T10:00:00Z',
        participant_contact_ids: [contactA],
      }));

      expect(() => activityService.batchCreate(userId, inputs)).toThrow(
        'Batch size exceeds maximum of 50 items'
      );
    });

    it('should roll back all activities on failure', () => {
      const initialList = activityService.list(userId);
      const initialCount = initialList.total;

      // The second activity references a non-existent contact
      expect(() => activityService.batchCreate(userId, [
        {
          type: 'phone_call',
          title: 'Good activity',
          occurred_at: '2025-01-15T10:00:00Z',
          participant_contact_ids: [contactA],
        },
        {
          type: 'email',
          title: 'Bad activity',
          occurred_at: '2025-01-15T11:00:00Z',
          participant_contact_ids: ['nonexistent-contact-id-that-will-fail-fk'],
        },
      ])).toThrow();

      // Verify no activities were created (transaction rolled back)
      const afterList = activityService.list(userId);
      expect(afterList.total).toBe(initialCount);
    });
  });
});
