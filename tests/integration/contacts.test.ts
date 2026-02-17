import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactService, calculateAge } from '../../src/services/contacts.js';
import { ContactMethodService } from '../../src/services/contact-methods.js';
import { AddressService } from '../../src/services/addresses.js';
import { FoodPreferencesService } from '../../src/services/food-preferences.js';
import { CustomFieldService } from '../../src/services/custom-fields.js';
import { RelationshipService } from '../../src/services/relationships.js';
import { NoteService } from '../../src/services/notes.js';
import { TagService } from '../../src/services/tags-groups.js';
import { ActivityService } from '../../src/services/activities.js';
import { LifeEventService } from '../../src/services/life-events.js';
import { ReminderService } from '../../src/services/reminders.js';
import { TaskService } from '../../src/services/tasks.js';
import { GiftService } from '../../src/services/gifts.js';
import { DebtService } from '../../src/services/debts.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('calculateAge', () => {
  it('should calculate age from full date', () => {
    const result = calculateAge({
      birthday_mode: 'full_date',
      birthday_date: '1990-01-15',
      birthday_year_approximate: null,
    });
    expect(result).not.toBeNull();
    expect(result!.approximate).toBe(false);
    expect(result!.age).toBeGreaterThanOrEqual(35);
  });

  it('should calculate approximate age from birth year', () => {
    const result = calculateAge({
      birthday_mode: 'approximate_age',
      birthday_date: null,
      birthday_year_approximate: 1990,
    });
    expect(result).not.toBeNull();
    expect(result!.approximate).toBe(true);
    expect(result!.age).toBeGreaterThanOrEqual(35);
  });

  it('should return null for month_day mode (no year)', () => {
    const result = calculateAge({
      birthday_mode: 'month_day',
      birthday_date: null,
      birthday_year_approximate: null,
    });
    expect(result).toBeNull();
  });

  it('should return null when no birthday mode set', () => {
    const result = calculateAge({
      birthday_mode: null,
      birthday_date: null,
      birthday_year_approximate: null,
    });
    expect(result).toBeNull();
  });
});

describe('ContactService', () => {
  let db: Database.Database;
  let service: ContactService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ContactService(db);
    userId = createTestUser(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe('create', () => {
    it('should create a contact with minimal fields', () => {
      const contact = service.create(userId, { first_name: 'Alice' });

      expect(contact.id).toBeDefined();
      expect(contact.first_name).toBe('Alice');
      expect(contact.last_name).toBeNull();
      expect(contact.status).toBe('active');
      expect(contact.is_favorite).toBe(false);
      expect(contact.created_at).toBeDefined();
    });

    it('should create a contact with all fields', () => {
      const contact = service.create(userId, {
        first_name: 'Alice',
        last_name: 'Smith',
        nickname: 'Ali',
        maiden_name: 'Johnson',
        gender: 'Female',
        pronouns: 'she/her',
        birthday_mode: 'full_date',
        birthday_date: '1990-03-15',
        status: 'active',
        is_favorite: true,
        met_at_date: '2020-01-01',
        met_at_location: 'Conference',
        met_description: 'Met at a tech conference',
        job_title: 'Engineer',
        company: 'Acme Corp',
        industry: 'Technology',
        work_notes: 'Works on backend systems',
      });

      expect(contact.first_name).toBe('Alice');
      expect(contact.last_name).toBe('Smith');
      expect(contact.nickname).toBe('Ali');
      expect(contact.maiden_name).toBe('Johnson');
      expect(contact.gender).toBe('Female');
      expect(contact.pronouns).toBe('she/her');
      expect(contact.birthday_mode).toBe('full_date');
      expect(contact.birthday_date).toBe('1990-03-15');
      expect(contact.is_favorite).toBe(true);
      expect(contact.company).toBe('Acme Corp');
      expect(contact.age).toBeGreaterThanOrEqual(35);
      expect(contact.age_approximate).toBe(false);
    });

    it('should create a contact with month_day birthday', () => {
      const contact = service.create(userId, {
        first_name: 'Bob',
        birthday_mode: 'month_day',
        birthday_month: 3,
        birthday_day: 15,
      });

      expect(contact.birthday_mode).toBe('month_day');
      expect(contact.birthday_month).toBe(3);
      expect(contact.birthday_day).toBe(15);
      expect(contact.age).toBeUndefined();
    });

    it('should create a contact with approximate age birthday', () => {
      const contact = service.create(userId, {
        first_name: 'Charlie',
        birthday_mode: 'approximate_age',
        birthday_year_approximate: 1985,
      });

      expect(contact.birthday_mode).toBe('approximate_age');
      expect(contact.birthday_year_approximate).toBe(1985);
      expect(contact.age).toBeGreaterThanOrEqual(40);
      expect(contact.age_approximate).toBe(true);
    });
  });

  describe('get', () => {
    it('should get a contact by ID', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const fetched = service.get(userId, created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.first_name).toBe('Alice');
    });

    it('should return null for non-existent contact', () => {
      const result = service.get(userId, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for deleted contact', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      service.softDelete(userId, created.id);

      const result = service.get(userId, created.id);
      expect(result).toBeNull();
    });

    it('should not return contacts belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const created = service.create(userId, { first_name: 'Alice' });

      const result = service.get(otherUserId, created.id);
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update contact fields', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, {
        last_name: 'Smith',
        company: 'Acme Corp',
        is_favorite: true,
      });

      expect(updated).not.toBeNull();
      expect(updated!.last_name).toBe('Smith');
      expect(updated!.company).toBe('Acme Corp');
      expect(updated!.is_favorite).toBe(true);
      expect(updated!.first_name).toBe('Alice'); // unchanged
    });

    it('should update status to archived', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, { status: 'archived' });

      expect(updated!.status).toBe('archived');
    });

    it('should update status to deceased with date', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, {
        status: 'deceased',
        deceased_date: '2024-06-15',
      });

      expect(updated!.status).toBe('deceased');
      expect(updated!.deceased_date).toBe('2024-06-15');
    });

    it('should return null for non-existent contact', () => {
      const result = service.update(userId, 'nonexistent', { first_name: 'Bob' });
      expect(result).toBeNull();
    });

    it('should update the updated_at timestamp', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, { last_name: 'Smith' });

      // updated_at should be set (we can't guarantee different from created_at due to speed)
      expect(updated!.updated_at).toBeDefined();
      expect(typeof updated!.updated_at).toBe('string');
    });
  });

  describe('softDelete', () => {
    it('should soft-delete a contact', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const result = service.softDelete(userId, created.id);

      expect(result).toBe(true);

      // Should not be findable anymore
      const fetched = service.get(userId, created.id);
      expect(fetched).toBeNull();
    });

    it('should return false for non-existent contact', () => {
      const result = service.softDelete(userId, 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return false for already deleted contact', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      service.softDelete(userId, created.id);

      const result = service.softDelete(userId, created.id);
      expect(result).toBe(false);
    });

    it('should reject deletion of self-contact (is_me = 1)', () => {
      // Manually insert a self-contact
      const selfId = Math.random().toString(36).substring(2, 18);
      db.prepare(`
        INSERT INTO contacts (id, user_id, first_name, last_name, is_me)
        VALUES (?, ?, ?, ?, 1)
      `).run(selfId, userId, 'Test', 'User');

      expect(() => service.softDelete(userId, selfId)).toThrow(
        'Cannot delete your own contact record'
      );

      // Verify the contact still exists
      const stillExists = service.get(userId, selfId);
      expect(stillExists).not.toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      service.create(userId, { first_name: 'Alice', last_name: 'Anderson', company: 'Acme' });
      service.create(userId, { first_name: 'Bob', last_name: 'Brown', company: 'Beta Inc', is_favorite: true });
      service.create(userId, { first_name: 'Charlie', last_name: 'Chen', status: 'archived' });
      service.create(userId, { first_name: 'Diana', last_name: 'Davis', company: 'Acme' });
    });

    it('should list all non-deleted contacts by default', () => {
      const result = service.list(userId);

      expect(result.total).toBe(4); // includes archived Charlie, excludes none
      expect(result.data).toHaveLength(4);
      expect(result.page).toBe(1);
      expect(result.per_page).toBe(20);
    });

    it('should filter by status', () => {
      const result = service.list(userId, { status: 'archived' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Charlie');
    });

    it('should filter to only active contacts', () => {
      const result = service.list(userId, { status: 'active' });
      expect(result.total).toBe(3);
      expect(result.data.every((c) => c.status === 'active')).toBe(true);
    });

    it('should filter by favorite', () => {
      const result = service.list(userId, { is_favorite: true });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Bob');
    });

    it('should filter by company', () => {
      const result = service.list(userId, { company: 'Acme' });
      expect(result.total).toBe(2);
    });

    it('should search by name', () => {
      const result = service.list(userId, { search: 'alice' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Alice');
    });

    it('should search by full name across first and last name fields', () => {
      const result = service.list(userId, { search: 'Alice Anderson' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Alice');
      expect(result.data[0].last_name).toBe('Anderson');
    });

    it('should search by company', () => {
      const result = service.list(userId, { search: 'Beta' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Bob');
    });

    it('should paginate results', () => {
      const page1 = service.list(userId, { per_page: 2, page: 1 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(4);

      const page2 = service.list(userId, { per_page: 2, page: 2 });
      expect(page2.data).toHaveLength(2);
    });

    it('should sort by name ascending by default', () => {
      const result = service.list(userId);
      const names = result.data.map((c) => c.last_name);
      expect(names).toEqual(['Anderson', 'Brown', 'Chen', 'Davis']);
    });

    it('should sort by name descending', () => {
      const result = service.list(userId, { sort_by: 'name', sort_order: 'desc' });
      const names = result.data.map((c) => c.last_name);
      expect(names).toEqual(['Davis', 'Chen', 'Brown', 'Anderson']);
    });

    it('should not include soft-deleted contacts', () => {
      const all = service.list(userId);
      const alice = all.data.find((c) => c.first_name === 'Alice')!;
      service.softDelete(userId, alice.id);

      const afterDelete = service.list(userId);
      expect(afterDelete.total).toBe(3);
    });

    it('should not include contacts from other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      service.create(otherUserId, { first_name: 'OtherUser' });

      const result = service.list(userId);
      expect(result.data.every((c) => c.first_name !== 'OtherUser')).toBe(true);
    });

    it('should include soft-deleted contacts when include_deleted is true', () => {
      const all = service.list(userId);
      const alice = all.data.find((c) => c.first_name === 'Alice')!;
      service.softDelete(userId, alice.id);

      const withDeleted = service.list(userId, { include_deleted: true });
      expect(withDeleted.total).toBe(4);

      const withoutDeleted = service.list(userId);
      expect(withoutDeleted.total).toBe(3);
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted contact', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      service.softDelete(userId, created.id);

      // Verify it's deleted
      expect(service.get(userId, created.id)).toBeNull();

      // Restore it
      const restored = service.restore(userId, created.id);
      expect(restored.id).toBe(created.id);
      expect(restored.first_name).toBe('Alice');
      expect(restored.deleted_at).toBeNull();

      // Verify it's accessible again
      expect(service.get(userId, created.id)).not.toBeNull();
    });

    it('should throw error when restoring non-existent contact', () => {
      expect(() => service.restore(userId, 'nonexistent')).toThrow('Contact not found or not deleted');
    });

    it('should throw error when restoring a contact that is not deleted', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      expect(() => service.restore(userId, created.id)).toThrow('Contact not found or not deleted');
    });

    it('should not restore contacts belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherContact = service.create(otherUserId, { first_name: 'Other' });
      service.softDelete(otherUserId, otherContact.id);

      expect(() => service.restore(userId, otherContact.id)).toThrow('Contact not found or not deleted');
    });
  });
});

describe('Enriched contact_get', () => {
  let db: Database.Database;
  let userId: string;
  let contacts: ContactService;
  let contactMethods: ContactMethodService;
  let addresses: AddressService;
  let foodPreferences: FoodPreferencesService;
  let customFields: CustomFieldService;
  let relationships: RelationshipService;
  let notes: NoteService;
  let tags: TagService;
  let activityService: ActivityService;
  let lifeEvents: LifeEventService;
  let reminderService: ReminderService;
  let taskService: TaskService;
  let giftService: GiftService;
  let debtService: DebtService;

  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    contacts = new ContactService(db);
    contactMethods = new ContactMethodService(db);
    addresses = new AddressService(db);
    foodPreferences = new FoodPreferencesService(db);
    customFields = new CustomFieldService(db);
    relationships = new RelationshipService(db);
    notes = new NoteService(db);
    tags = new TagService(db);
    activityService = new ActivityService(db);
    lifeEvents = new LifeEventService(db);
    reminderService = new ReminderService(db);
    taskService = new TaskService(db);
    giftService = new GiftService(db);
    debtService = new DebtService(db);
    userId = createTestUser(db);

    const contact = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    contactId = contact.id;
  });

  afterEach(() => {
    closeDatabase(db);
  });

  /** Helper that mimics the contact_get handler in mcp-server.ts */
  function getEnrichedContact(uid: string, cid: string) {
    const contact = contacts.get(uid, cid);
    if (!contact) return null;

    const recentNotes = notes.listByContact(uid, cid, { per_page: 10 });
    const recentActivities = activityService.list(uid, { contact_id: cid, per_page: 10 });
    const allLifeEvents = lifeEvents.listByContact(uid, cid, { per_page: 1000 });

    const activeReminderRows = db.prepare(`
      SELECT r.* FROM reminders r
      JOIN contacts c ON r.contact_id = c.id
      WHERE r.contact_id = ? AND r.deleted_at IS NULL AND c.deleted_at IS NULL AND c.user_id = ?
        AND r.status NOT IN ('completed', 'dismissed')
      ORDER BY r.reminder_date ASC
    `).all(cid, uid) as any[];
    const activeReminders = activeReminderRows.map((r: any) => ({
      ...r,
      is_auto_generated: Boolean(r.is_auto_generated),
    }));

    const openTaskRows = db.prepare(`
      SELECT * FROM tasks
      WHERE contact_id = ? AND user_id = ? AND deleted_at IS NULL
        AND status != 'completed'
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
        due_date ASC NULLS LAST,
        created_at DESC
    `).all(cid, uid) as any[];

    const recentGifts = giftService.list(uid, { contact_id: cid, per_page: 10 });
    const activeDebts = debtService.list(uid, { contact_id: cid, status: 'active' });
    const debtSummary = debtService.summary(uid, cid);

    return {
      ...contact,
      contact_methods: contactMethods.listByContact(cid),
      addresses: addresses.listByContact(cid),
      food_preferences: foodPreferences.get(cid),
      custom_fields: customFields.listByContact(cid),
      tags: tags.listByContact(cid),
      relationships: relationships.listByContact(cid),
      recent_notes: recentNotes.data,
      recent_activities: recentActivities.data,
      life_events: allLifeEvents.data,
      active_reminders: activeReminders,
      open_tasks: openTaskRows,
      recent_gifts: recentGifts.data,
      active_debts: activeDebts.data,
      debt_summary: debtSummary,
    };
  }

  it('should return all enriched fields even when empty', () => {
    const result = getEnrichedContact(userId, contactId)!;

    expect(result).not.toBeNull();
    expect(result.first_name).toBe('Alice');
    expect(result.contact_methods).toEqual([]);
    expect(result.addresses).toEqual([]);
    expect(result.custom_fields).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.recent_notes).toEqual([]);
    expect(result.recent_activities).toEqual([]);
    expect(result.life_events).toEqual([]);
    expect(result.active_reminders).toEqual([]);
    expect(result.open_tasks).toEqual([]);
    expect(result.recent_gifts).toEqual([]);
    expect(result.active_debts).toEqual([]);
    expect(result.debt_summary).toEqual([]);
  });

  it('should include relationships with related contact names', () => {
    const bob = contacts.create(userId, { first_name: 'Bob', last_name: 'Jones' });
    relationships.add({
      contact_id: contactId,
      related_contact_id: bob.id,
      relationship_type: 'friend',
    });

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].relationship_type).toBe('friend');
    expect(result.relationships[0].related_contact_name).toContain('Bob');
  });

  it('should include recent notes (pinned first)', () => {
    notes.create(userId, { contact_id: contactId, body: 'Regular note', title: 'Note 1' });
    notes.create(userId, { contact_id: contactId, body: 'Pinned note', title: 'Pinned', is_pinned: true });

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.recent_notes).toHaveLength(2);
    // Pinned should come first
    expect(result.recent_notes[0].title).toBe('Pinned');
    expect(result.recent_notes[0].is_pinned).toBe(true);
  });

  it('should limit notes to 10', () => {
    for (let i = 0; i < 15; i++) {
      notes.create(userId, { contact_id: contactId, body: `Note ${i}`, title: `Title ${i}` });
    }

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.recent_notes).toHaveLength(10);
  });

  it('should include recent activities', () => {
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Quick call',
      occurred_at: '2025-01-15',
      participant_contact_ids: [contactId],
    });

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.recent_activities).toHaveLength(1);
    expect(result.recent_activities[0].title).toBe('Quick call');
    expect(result.recent_activities[0].type).toBe('phone_call');
  });

  it('should include life events', () => {
    lifeEvents.create(userId, {
      contact_id: contactId,
      event_type: 'new_job',
      title: 'Started at Google',
      occurred_at: '2025-03-01',
    });

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.life_events).toHaveLength(1);
    expect(result.life_events[0].title).toBe('Started at Google');
    expect(result.life_events[0].event_type).toBe('new_job');
  });

  it('should include only active reminders (not completed/dismissed)', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    reminderService.create(userId, {
      contact_id: contactId,
      title: 'Active reminder',
      reminder_date: tomorrow,
    });
    const completedReminder = reminderService.create(userId, {
      contact_id: contactId,
      title: 'Completed reminder',
      reminder_date: nextWeek,
    });
    reminderService.complete(userId, completedReminder.id);

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.active_reminders).toHaveLength(1);
    expect(result.active_reminders[0].title).toBe('Active reminder');
  });

  it('should include snoozed reminders as active', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const reminder = reminderService.create(userId, {
      contact_id: contactId,
      title: 'Snoozed reminder',
      reminder_date: tomorrow,
    });
    reminderService.snooze(userId, reminder.id, nextMonth);

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.active_reminders).toHaveLength(1);
    expect(result.active_reminders[0].title).toBe('Snoozed reminder');
    expect(result.active_reminders[0].status).toBe('snoozed');
  });

  it('should include only open tasks (not completed)', () => {
    taskService.create(userId, {
      contact_id: contactId,
      title: 'Pending task',
      priority: 'high',
    });
    taskService.create(userId, {
      contact_id: contactId,
      title: 'In progress task',
      priority: 'medium',
    });
    const completedTask = taskService.create(userId, {
      contact_id: contactId,
      title: 'Completed task',
    });
    taskService.complete(userId, completedTask.id);

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.open_tasks).toHaveLength(2);
    const taskTitles = result.open_tasks.map((t: any) => t.title);
    expect(taskTitles).toContain('Pending task');
    expect(taskTitles).toContain('In progress task');
    expect(taskTitles).not.toContain('Completed task');
  });

  it('should order open tasks by priority (high first)', () => {
    taskService.create(userId, {
      contact_id: contactId,
      title: 'Low task',
      priority: 'low',
    });
    taskService.create(userId, {
      contact_id: contactId,
      title: 'High task',
      priority: 'high',
    });

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.open_tasks[0].title).toBe('High task');
    expect(result.open_tasks[1].title).toBe('Low task');
  });

  it('should include recent gifts', () => {
    giftService.create(userId, {
      contact_id: contactId,
      name: 'Book',
      direction: 'giving',
      status: 'idea',
    });

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.recent_gifts).toHaveLength(1);
    expect(result.recent_gifts[0].name).toBe('Book');
    expect(result.recent_gifts[0].direction).toBe('giving');
  });

  it('should include only active (unsettled) debts', () => {
    debtService.create(userId, {
      contact_id: contactId,
      amount: 50,
      direction: 'they_owe_me',
      reason: 'Lunch',
    });
    const settledDebt = debtService.create(userId, {
      contact_id: contactId,
      amount: 20,
      direction: 'i_owe_them',
      reason: 'Coffee',
    });
    debtService.settle(userId, settledDebt.id);

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.active_debts).toHaveLength(1);
    expect(result.active_debts[0].reason).toBe('Lunch');
    expect(result.active_debts[0].status).toBe('active');
  });

  it('should include debt summary', () => {
    debtService.create(userId, {
      contact_id: contactId,
      amount: 50,
      direction: 'they_owe_me',
      reason: 'Lunch',
    });
    debtService.create(userId, {
      contact_id: contactId,
      amount: 20,
      direction: 'i_owe_them',
      reason: 'Coffee',
    });

    const result = getEnrichedContact(userId, contactId)!;
    expect(result.debt_summary).toHaveLength(1);
    expect(result.debt_summary[0].total_they_owe).toBe(50);
    expect(result.debt_summary[0].total_i_owe).toBe(20);
    expect(result.debt_summary[0].net_balance).toBe(30);
    expect(result.debt_summary[0].currency).toBe('USD');
  });

  it('should include all enriched data together', () => {
    // Create a related contact
    const bob = contacts.create(userId, { first_name: 'Bob' });

    // Add various sub-entities
    relationships.add({ contact_id: contactId, related_contact_id: bob.id, relationship_type: 'colleague' });
    notes.create(userId, { contact_id: contactId, body: 'Important note', title: 'Note' });
    activityService.create(userId, { type: 'in_person', title: 'Coffee', occurred_at: '2025-06-01', participant_contact_ids: [contactId] });
    lifeEvents.create(userId, { contact_id: contactId, event_type: 'moved', title: 'Moved to NYC' });

    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    reminderService.create(userId, { contact_id: contactId, title: 'Follow up', reminder_date: tomorrow });
    taskService.create(userId, { contact_id: contactId, title: 'Send email', priority: 'high' });
    giftService.create(userId, { contact_id: contactId, name: 'Wine', direction: 'giving' });
    debtService.create(userId, { contact_id: contactId, amount: 100, direction: 'they_owe_me', reason: 'Dinner' });

    const result = getEnrichedContact(userId, contactId)!;

    // Verify all enriched fields are present and populated
    expect(result.first_name).toBe('Alice');
    expect(result.relationships).toHaveLength(1);
    expect(result.recent_notes).toHaveLength(1);
    expect(result.recent_activities).toHaveLength(1);
    expect(result.life_events).toHaveLength(1);
    expect(result.active_reminders).toHaveLength(1);
    expect(result.open_tasks).toHaveLength(1);
    expect(result.recent_gifts).toHaveLength(1);
    expect(result.active_debts).toHaveLength(1);
    expect(result.debt_summary).toHaveLength(1);
    expect(result.debt_summary[0].net_balance).toBe(100);
  });

  it('should return null for non-existent contact', () => {
    const result = getEnrichedContact(userId, 'nonexistent');
    expect(result).toBeNull();
  });
});
