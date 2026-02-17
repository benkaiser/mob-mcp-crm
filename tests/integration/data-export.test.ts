import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DataExportService } from '../../src/services/data-export.js';
import { ContactService } from '../../src/services/contacts.js';
import { NoteService } from '../../src/services/notes.js';
import { ActivityService } from '../../src/services/activities.js';
import { LifeEventService } from '../../src/services/life-events.js';
import { ReminderService } from '../../src/services/reminders.js';
import { GiftService } from '../../src/services/gifts.js';
import { DebtService } from '../../src/services/debts.js';
import { TaskService } from '../../src/services/tasks.js';
import { TagService } from '../../src/services/tags-groups.js';
import { RelationshipService } from '../../src/services/relationships.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('DataExportService', () => {
  let db: Database.Database;
  let service: DataExportService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new DataExportService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice', lastName: 'Smith' });
  });

  afterEach(() => closeDatabase(db));

  describe('exportAll', () => {
    it('should export empty data for new user', () => {
      const data = service.exportAll(userId);
      expect(data.version).toBe('1.0');
      expect(data.exported_at).toBeDefined();
      expect(data.contacts).toHaveLength(1); // Alice
      expect(data.relationships).toHaveLength(0);
      expect(data.notes).toHaveLength(0);
      expect(data.activities).toHaveLength(0);
      expect(data.life_events).toHaveLength(0);
      expect(data.reminders).toHaveLength(0);
      expect(data.notifications).toHaveLength(0);
      expect(data.gifts).toHaveLength(0);
      expect(data.debts).toHaveLength(0);
      expect(data.tasks).toHaveLength(0);
      expect(data.tags).toHaveLength(0);
    });

    it('should export all entity types', () => {
      const contactB = createTestContact(db, userId, { firstName: 'Bob' });

      // Create one of each entity type
      const noteService = new NoteService(db);
      noteService.create(userId, { contact_id: contactId, body: 'A note' });

      const activityService = new ActivityService(db);
      activityService.create(userId, {
        type: 'phone_call',
        occurred_at: '2024-06-15T10:00:00Z',
        participant_contact_ids: [contactId],
      });

      const lifeEventService = new LifeEventService(db);
      lifeEventService.create(userId, {
        contact_id: contactId,
        event_type: 'new_job',
        title: 'New Job',
      });

      const reminderService = new ReminderService(db);
      reminderService.create(userId, {
        contact_id: contactId,
        title: 'Call Alice',
        reminder_date: '2024-07-01',
      });

      const giftService = new GiftService(db);
      giftService.create(userId, {
        contact_id: contactId,
        name: 'Book',
        direction: 'giving',
      });

      const debtService = new DebtService(db);
      debtService.create(userId, {
        contact_id: contactId,
        amount: 50,
        direction: 'i_owe_them',
      });

      const taskService = new TaskService(db);
      taskService.create(userId, { title: 'Test task' });

      const tagService = new TagService(db);
      tagService.create(userId, 'VIP');

      const relService = new RelationshipService(db);
      relService.add({
        contact_id: contactId,
        related_contact_id: contactB,
        relationship_type: 'friend',
      });

      const data = service.exportAll(userId);
      expect(data.contacts).toHaveLength(2);
      expect(data.notes).toHaveLength(1);
      expect(data.activities).toHaveLength(1);
      expect(data.activities[0].participants).toHaveLength(1);
      expect(data.life_events).toHaveLength(1);
      expect(data.reminders).toHaveLength(1);
      expect(data.gifts).toHaveLength(1);
      expect(data.debts).toHaveLength(1);
      expect(data.tasks).toHaveLength(1);
      expect(data.tags).toHaveLength(1);
      expect(data.relationships.length).toBeGreaterThanOrEqual(1);
    });

    it('should exclude soft-deleted entities', () => {
      const noteService = new NoteService(db);
      const note = noteService.create(userId, { contact_id: contactId, body: 'Deleted note' });
      noteService.softDelete(userId, note.id);

      const data = service.exportAll(userId);
      expect(data.notes).toHaveLength(0);
    });
  });

  describe('getStatistics', () => {
    it('should return basic statistics', () => {
      const stats = service.getStatistics(userId);
      expect(stats.total_contacts).toBe(1);
      expect(stats.active_contacts).toBe(1);
      expect(stats.archived_contacts).toBe(0);
      expect(stats.favorite_contacts).toBe(0);
      expect(stats.total_activities).toBe(0);
      expect(stats.total_notes).toBe(0);
      expect(stats.total_life_events).toBe(0);
      expect(stats.total_relationships).toBe(0);
      expect(stats.pending_reminders).toBe(0);
      expect(stats.active_debts).toBe(0);
      expect(stats.pending_tasks).toBe(0);
      expect(stats.gift_ideas).toBe(0);
      expect(stats.tags_count).toBe(0);
      expect(stats.contacts_by_company).toHaveLength(0);
      expect(stats.recent_activities).toBe(0);
    });

    it('should count contacts by status', () => {
      const contactService = new ContactService(db);
      contactService.create(userId, { first_name: 'Bob', status: 'archived' });
      createTestContact(db, userId, { firstName: 'Charlie', isFavorite: true });

      const stats = service.getStatistics(userId);
      expect(stats.total_contacts).toBe(3);
      expect(stats.active_contacts).toBe(2);
      expect(stats.archived_contacts).toBe(1);
      expect(stats.favorite_contacts).toBe(1);
    });

    it('should count activities and notes', () => {
      const noteService = new NoteService(db);
      noteService.create(userId, { contact_id: contactId, body: 'Note 1' });
      noteService.create(userId, { contact_id: contactId, body: 'Note 2' });

      const activityService = new ActivityService(db);
      activityService.create(userId, {
        type: 'phone_call',
        occurred_at: new Date().toISOString(),
        participant_contact_ids: [contactId],
      });

      const stats = service.getStatistics(userId);
      expect(stats.total_notes).toBe(2);
      expect(stats.total_activities).toBe(1);
      expect(stats.recent_activities).toBe(1);
    });

    it('should count pending items', () => {
      const reminderService = new ReminderService(db);
      reminderService.create(userId, { contact_id: contactId, title: 'R1', reminder_date: '2024-07-01' });
      reminderService.create(userId, { contact_id: contactId, title: 'R2', reminder_date: '2024-07-02' });

      const debtService = new DebtService(db);
      debtService.create(userId, { contact_id: contactId, amount: 50, direction: 'i_owe_them' });

      const taskService = new TaskService(db);
      taskService.create(userId, { title: 'T1' });
      const t2 = taskService.create(userId, { title: 'T2' });
      taskService.complete(userId, t2.id);

      const giftService = new GiftService(db);
      giftService.create(userId, { contact_id: contactId, name: 'Idea', direction: 'giving' });

      const stats = service.getStatistics(userId);
      expect(stats.pending_reminders).toBe(2);
      expect(stats.active_debts).toBe(1);
      expect(stats.pending_tasks).toBe(1);
      expect(stats.gift_ideas).toBe(1);
    });

    it('should group contacts by company', () => {
      const contactService = new ContactService(db);
      contactService.create(userId, { first_name: 'Bob', company: 'Google' });
      contactService.create(userId, { first_name: 'Charlie', company: 'Google' });
      contactService.create(userId, { first_name: 'Dave', company: 'Apple' });

      const stats = service.getStatistics(userId);
      expect(stats.contacts_by_company).toHaveLength(2);
      const google = stats.contacts_by_company.find((c) => c.company === 'Google');
      expect(google!.count).toBe(2);
    });
  });
});
