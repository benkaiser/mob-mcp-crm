import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SearchService } from '../../src/services/search.js';
import { NoteService } from '../../src/services/notes.js';
import { ActivityService } from '../../src/services/activities.js';
import { LifeEventService } from '../../src/services/life-events.js';
import { GiftService } from '../../src/services/gifts.js';
import { TaskService } from '../../src/services/tasks.js';
import { ReminderService } from '../../src/services/reminders.js';
import { DebtService } from '../../src/services/debts.js';
import { RelationshipService } from '../../src/services/relationships.js';
import { ContactMethodService } from '../../src/services/contact-methods.js';
import { AddressService } from '../../src/services/addresses.js';
import { CustomFieldService } from '../../src/services/custom-fields.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('SearchService.globalSearch', () => {
  let db: Database.Database;
  let searchService: SearchService;
  let noteService: NoteService;
  let activityService: ActivityService;
  let lifeEventService: LifeEventService;
  let giftService: GiftService;
  let taskService: TaskService;
  let reminderService: ReminderService;
  let debtService: DebtService;
  let relationshipService: RelationshipService;
  let contactMethodService: ContactMethodService;
  let addressService: AddressService;
  let customFieldService: CustomFieldService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    searchService = new SearchService(db);
    noteService = new NoteService(db);
    activityService = new ActivityService(db);
    lifeEventService = new LifeEventService(db);
    giftService = new GiftService(db);
    taskService = new TaskService(db);
    reminderService = new ReminderService(db);
    debtService = new DebtService(db);
    relationshipService = new RelationshipService(db);
    contactMethodService = new ContactMethodService(db);
    addressService = new AddressService(db);
    customFieldService = new CustomFieldService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice', lastName: 'Smith' });
  });

  afterEach(() => closeDatabase(db));

  it('should search across multiple entity types', () => {
    // Create entities with "Tokyo" in them
    noteService.create(userId, { contact_id: contactId, title: 'Tokyo trip', body: 'Planning a trip to Tokyo' });
    activityService.create(userId, {
      type: 'in_person',
      title: 'Dinner discussing Tokyo',
      occurred_at: new Date().toISOString(),
      participant_contact_ids: [contactId],
    });
    taskService.create(userId, { title: 'Book Tokyo flights', description: 'Need to book flights' });

    const result = searchService.globalSearch(userId, { query: 'Tokyo' });
    expect(result.total_matches).toBe(3);
    expect(result.results.notes).toHaveLength(1);
    expect(result.results.activities).toHaveLength(1);
    expect(result.results.tasks).toHaveLength(1);
  });

  it('should search contacts by name', () => {
    const result = searchService.globalSearch(userId, { query: 'Alice' });
    expect(result.results.contacts).toHaveLength(1);
    expect(result.results.contacts[0].title).toContain('Alice');
  });

  it('should search contacts by company', () => {
    db.prepare('UPDATE contacts SET company = ? WHERE id = ?').run('Acme Corp', contactId);

    const result = searchService.globalSearch(userId, { query: 'Acme' });
    expect(result.results.contacts).toHaveLength(1);
    expect(result.results.contacts[0].match_field).toBe('company');
  });

  it('should filter by entity types', () => {
    noteService.create(userId, { contact_id: contactId, title: 'Important', body: 'Important note about work' });
    taskService.create(userId, { title: 'Important task' });

    const result = searchService.globalSearch(userId, {
      query: 'Important',
      entity_types: ['notes'],
    });
    expect(result.results.notes).toHaveLength(1);
    expect(result.results.tasks).toHaveLength(0); // filtered out
  });

  it('should respect limit_per_type', () => {
    for (let i = 0; i < 5; i++) {
      noteService.create(userId, { contact_id: contactId, title: `Note about work ${i}`, body: `Work notes ${i}` });
    }

    const result = searchService.globalSearch(userId, { query: 'work', limit_per_type: 3 });
    expect(result.results.notes).toHaveLength(3);
  });

  it('should include snippet for notes', () => {
    noteService.create(userId, { contact_id: contactId, body: 'This is a long note about the wedding planning details and venue selection' });

    const result = searchService.globalSearch(userId, { query: 'wedding' });
    expect(result.results.notes[0].snippet).toContain('wedding');
  });

  it('should truncate long snippets', () => {
    const longText = 'x'.repeat(300);
    noteService.create(userId, { contact_id: contactId, body: longText });

    const result = searchService.globalSearch(userId, { query: 'xxx' });
    expect(result.results.notes[0].snippet.length).toBeLessThanOrEqual(204); // 200 + '...'
  });

  it('should include contact_name for notes', () => {
    noteService.create(userId, { contact_id: contactId, body: 'Test note content' });

    const result = searchService.globalSearch(userId, { query: 'Test' });
    expect(result.results.notes[0].contact_name).toBe('Alice Smith');
    expect(result.results.notes[0].contact_id).toBe(contactId);
  });

  it('should search life events', () => {
    lifeEventService.create(userId, {
      contact_id: contactId,
      event_type: 'relocation',
      title: 'Moved to Berlin',
      description: 'Relocated for a new job opportunity',
    });

    const result = searchService.globalSearch(userId, { query: 'Berlin' });
    expect(result.results.life_events).toHaveLength(1);
    expect(result.results.life_events[0].title).toBe('Moved to Berlin');
  });

  it('should search gifts', () => {
    giftService.create(userId, {
      contact_id: contactId,
      name: 'Kindle Paperwhite',
      description: 'For birthday',
      direction: 'giving',
    });

    const result = searchService.globalSearch(userId, { query: 'Kindle' });
    expect(result.results.gifts).toHaveLength(1);
    expect(result.results.gifts[0].title).toBe('Kindle Paperwhite');
    expect(result.results.gifts[0].contact_name).toBe('Alice Smith');
  });

  it('should exclude soft-deleted entities', () => {
    const note = noteService.create(userId, { contact_id: contactId, body: 'Deletable note' });
    noteService.softDelete(userId, note.id);

    const result = searchService.globalSearch(userId, { query: 'Deletable' });
    expect(result.results.notes).toHaveLength(0);
  });

  it('should exclude entities of soft-deleted contacts', () => {
    noteService.create(userId, { contact_id: contactId, body: 'Orphaned note' });
    db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(contactId);

    const result = searchService.globalSearch(userId, { query: 'Orphaned' });
    expect(result.results.notes).toHaveLength(0);
  });

  it('should only search within the given user', () => {
    const otherUserId = createTestUser(db, { email: 'other@test.com' });
    const otherContact = createTestContact(db, otherUserId, { firstName: 'Other' });
    noteService.create(otherUserId, { contact_id: otherContact, body: 'Other user private note' });
    noteService.create(userId, { contact_id: contactId, body: 'My private note' });

    const result = searchService.globalSearch(userId, { query: 'private' });
    expect(result.results.notes).toHaveLength(1);
    expect(result.results.notes[0].contact_name).toBe('Alice Smith');
  });

  it('should return empty results for no matches', () => {
    const result = searchService.globalSearch(userId, { query: 'nonexistent_term_xyz' });
    expect(result.total_matches).toBe(0);
    expect(result.results.contacts).toHaveLength(0);
    expect(result.results.notes).toHaveLength(0);
  });

  it('should search activity descriptions', () => {
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Regular call',
      description: 'Discussed the wedding venue options',
      occurred_at: new Date().toISOString(),
      participant_contact_ids: [contactId],
    });

    const result = searchService.globalSearch(userId, { query: 'wedding' });
    expect(result.results.activities).toHaveLength(1);
  });

  it('should search task descriptions', () => {
    taskService.create(userId, {
      title: 'General task',
      description: 'Follow up about the birthday party',
      contact_id: contactId,
    });

    const result = searchService.globalSearch(userId, { query: 'birthday' });
    expect(result.results.tasks).toHaveLength(1);
    expect(result.results.tasks[0].contact_name).toBe('Alice Smith');
  });

  // ─── Reminders ──────────────────────────────────────────────────

  it('should search reminders by title', () => {
    reminderService.create(userId, {
      contact_id: contactId,
      title: 'Call about graduation ceremony',
      reminder_date: new Date().toISOString(),
    });

    const result = searchService.globalSearch(userId, { query: 'graduation' });
    expect(result.results.reminders).toHaveLength(1);
    expect(result.results.reminders[0].title).toBe('Call about graduation ceremony');
    expect(result.results.reminders[0].contact_name).toBe('Alice Smith');
  });

  it('should search reminders by description', () => {
    reminderService.create(userId, {
      contact_id: contactId,
      title: 'Follow up',
      description: 'Discuss the quarterly review results',
      reminder_date: new Date().toISOString(),
    });

    const result = searchService.globalSearch(userId, { query: 'quarterly' });
    expect(result.results.reminders).toHaveLength(1);
    expect(result.results.reminders[0].snippet).toContain('quarterly');
  });

  it('should exclude soft-deleted reminders', () => {
    const reminder = reminderService.create(userId, {
      contact_id: contactId,
      title: 'Deletable reminder xyz',
      reminder_date: new Date().toISOString(),
    });
    reminderService.softDelete(userId, reminder.id);

    const result = searchService.globalSearch(userId, { query: 'Deletable reminder xyz' });
    expect(result.results.reminders).toHaveLength(0);
  });

  // ─── Debts ──────────────────────────────────────────────────────

  it('should search debts by reason', () => {
    debtService.create(userId, {
      contact_id: contactId,
      amount: 50,
      direction: 'i_owe_them',
      reason: 'Split the dinner bill at the steakhouse',
    });

    const result = searchService.globalSearch(userId, { query: 'steakhouse' });
    expect(result.results.debts).toHaveLength(1);
    expect(result.results.debts[0].snippet).toContain('steakhouse');
    expect(result.results.debts[0].contact_name).toBe('Alice Smith');
  });

  it('should exclude soft-deleted debts', () => {
    const debt = debtService.create(userId, {
      contact_id: contactId,
      amount: 100,
      direction: 'they_owe_me',
      reason: 'Deletable debt xyz',
    });
    debtService.softDelete(userId, debt.id);

    const result = searchService.globalSearch(userId, { query: 'Deletable debt xyz' });
    expect(result.results.debts).toHaveLength(0);
  });

  // ─── Relationships ─────────────────────────────────────────────

  it('should search relationships by type', () => {
    const relatedContactId = createTestContact(db, userId, { firstName: 'Bob', lastName: 'Jones' });
    relationshipService.add({
      contact_id: contactId,
      related_contact_id: relatedContactId,
      relationship_type: 'sibling',
    });

    const result = searchService.globalSearch(userId, { query: 'sibling' });
    expect(result.results.relationships.length).toBeGreaterThanOrEqual(1);
    expect(result.results.relationships[0].title).toContain('sibling');
  });

  it('should search relationships by related contact name', () => {
    const relatedContactId = createTestContact(db, userId, { firstName: 'Charlie', lastName: 'Brown' });
    relationshipService.add({
      contact_id: contactId,
      related_contact_id: relatedContactId,
      relationship_type: 'friend',
    });

    const result = searchService.globalSearch(userId, { query: 'Charlie' });
    // Should find both the contact and the relationship
    expect(result.results.relationships.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Contact Methods ───────────────────────────────────────────

  it('should search contact methods by value (email)', () => {
    contactMethodService.add({
      contact_id: contactId,
      type: 'email',
      value: 'alice@wonderland.example.com',
    });

    const result = searchService.globalSearch(userId, { query: 'wonderland' });
    expect(result.results.contact_methods).toHaveLength(1);
    expect(result.results.contact_methods[0].title).toContain('alice@wonderland.example.com');
    expect(result.results.contact_methods[0].contact_name).toBe('Alice Smith');
  });

  it('should search contact methods by value (phone)', () => {
    contactMethodService.add({
      contact_id: contactId,
      type: 'phone',
      value: '+1-555-867-5309',
    });

    const result = searchService.globalSearch(userId, { query: '867-5309' });
    expect(result.results.contact_methods).toHaveLength(1);
    expect(result.results.contact_methods[0].contact_id).toBe(contactId);
  });

  // ─── Addresses ─────────────────────────────────────────────────

  it('should search addresses by city', () => {
    addressService.add({
      contact_id: contactId,
      city: 'San Francisco',
      state_province: 'California',
      country: 'USA',
    });

    const result = searchService.globalSearch(userId, { query: 'San Francisco' });
    expect(result.results.addresses).toHaveLength(1);
    expect(result.results.addresses[0].snippet).toContain('San Francisco');
    expect(result.results.addresses[0].contact_name).toBe('Alice Smith');
  });

  it('should search addresses by street', () => {
    addressService.add({
      contact_id: contactId,
      street_line_1: '742 Evergreen Terrace',
      city: 'Springfield',
    });

    const result = searchService.globalSearch(userId, { query: 'Evergreen' });
    expect(result.results.addresses).toHaveLength(1);
    expect(result.results.addresses[0].snippet).toContain('Evergreen');
  });

  it('should search addresses by country', () => {
    addressService.add({
      contact_id: contactId,
      city: 'Munich',
      country: 'Germany',
    });

    const result = searchService.globalSearch(userId, { query: 'Germany' });
    expect(result.results.addresses).toHaveLength(1);
  });

  it('should search addresses by postal code', () => {
    addressService.add({
      contact_id: contactId,
      city: 'New York',
      postal_code: '10001',
    });

    const result = searchService.globalSearch(userId, { query: '10001' });
    expect(result.results.addresses).toHaveLength(1);
  });

  // ─── Custom Fields ─────────────────────────────────────────────

  it('should search custom fields by field name', () => {
    customFieldService.add({
      contact_id: contactId,
      field_name: 'favorite_color',
      field_value: 'blue',
    });

    const result = searchService.globalSearch(userId, { query: 'favorite_color' });
    expect(result.results.custom_fields).toHaveLength(1);
    expect(result.results.custom_fields[0].contact_name).toBe('Alice Smith');
  });

  it('should search custom fields by field value', () => {
    customFieldService.add({
      contact_id: contactId,
      field_name: 'hobby',
      field_value: 'skydiving',
    });

    const result = searchService.globalSearch(userId, { query: 'skydiving' });
    expect(result.results.custom_fields).toHaveLength(1);
    expect(result.results.custom_fields[0].title).toContain('skydiving');
  });

  // ─── Cross-entity and isolation ─────────────────────────────────

  it('should exclude new entity types when filtering by entity_types', () => {
    reminderService.create(userId, {
      contact_id: contactId,
      title: 'Unique reminder xyzzy',
      reminder_date: new Date().toISOString(),
    });
    customFieldService.add({
      contact_id: contactId,
      field_name: 'xyzzy_field',
      field_value: 'xyzzy_value',
    });

    const result = searchService.globalSearch(userId, {
      query: 'xyzzy',
      entity_types: ['reminders'],
    });
    expect(result.results.reminders).toHaveLength(1);
    expect(result.results.custom_fields).toHaveLength(0);
  });

  it('should exclude new entity types of soft-deleted contacts', () => {
    contactMethodService.add({
      contact_id: contactId,
      type: 'email',
      value: 'orphaned@example.com',
    });
    addressService.add({
      contact_id: contactId,
      city: 'OrphanedCity',
    });
    customFieldService.add({
      contact_id: contactId,
      field_name: 'orphaned_field',
      field_value: 'orphaned_value',
    });

    db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(contactId);

    const result = searchService.globalSearch(userId, { query: 'orphaned' });
    expect(result.results.contact_methods).toHaveLength(0);
    expect(result.results.addresses).toHaveLength(0);
    expect(result.results.custom_fields).toHaveLength(0);
  });
});
