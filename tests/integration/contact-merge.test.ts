import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactService } from '../../src/services/contacts.js';
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
import { GiftService } from '../../src/services/gifts.js';
import { DebtService } from '../../src/services/debts.js';
import { TaskService } from '../../src/services/tasks.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ContactService.merge', () => {
  let db: Database.Database;
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
  let giftService: GiftService;
  let debtService: DebtService;
  let taskService: TaskService;
  let userId: string;

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
    giftService = new GiftService(db);
    debtService = new DebtService(db);
    taskService = new TaskService(db);
    userId = createTestUser(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('should merge basic child entities (notes, contact_methods, addresses, reminders, gifts, debts)', () => {
    const primary = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    const secondary = contacts.create(userId, { first_name: 'Alice', last_name: 'S' });

    // Add child entities to secondary
    notes.create(userId, { contact_id: secondary.id, body: 'A note', title: 'Note 1' });
    contactMethods.add({ contact_id: secondary.id, type: 'email', value: 'alice@example.com' });
    addresses.add({ contact_id: secondary.id, street_line_1: '123 Main St', city: 'NYC' });
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    reminderService.create(userId, { contact_id: secondary.id, title: 'Call Alice', reminder_date: tomorrow });
    giftService.create(userId, { contact_id: secondary.id, name: 'Book', direction: 'giving', status: 'idea' });
    debtService.create(userId, { contact_id: secondary.id, amount: 50, direction: 'they_owe_me' });

    const result = contacts.merge(userId, primary.id, secondary.id);

    // All child records moved to primary
    expect(result.summary['notes']).toBe(1);
    expect(result.summary['contact_methods']).toBe(1);
    expect(result.summary['addresses']).toBe(1);
    expect(result.summary['reminders']).toBe(1);
    expect(result.summary['gifts']).toBe(1);
    expect(result.summary['debts']).toBe(1);

    // Verify the records actually point to primary
    expect(contactMethods.listByContact(primary.id)).toHaveLength(1);
    expect(addresses.listByContact(primary.id)).toHaveLength(1);

    // Verify secondary no longer has them
    expect(contactMethods.listByContact(secondary.id)).toHaveLength(0);
    expect(addresses.listByContact(secondary.id)).toHaveLength(0);
  });

  it('should reassign tasks from secondary to primary', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    taskService.create(userId, { contact_id: secondary.id, title: 'Follow up' });

    const result = contacts.merge(userId, primary.id, secondary.id);

    expect(result.summary['tasks']).toBe(1);
  });

  it('should reassign activity participants from secondary to primary', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    activityService.create(userId, {
      type: 'phone_call',
      title: 'Quick call',
      occurred_at: '2025-01-15',
      participant_contact_ids: [secondary.id],
    });

    const result = contacts.merge(userId, primary.id, secondary.id);

    expect(result.summary['activity_participants']).toBe(1);

    // Verify primary is now a participant
    const activities = activityService.list(userId, { contact_id: primary.id });
    expect(activities.data).toHaveLength(1);
    expect(activities.data[0].title).toBe('Quick call');
  });

  it('should handle activity where both contacts are participants (dedup)', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    // Both are participants in the same activity
    activityService.create(userId, {
      type: 'in_person',
      title: 'Group meeting',
      occurred_at: '2025-01-15',
      participant_contact_ids: [primary.id, secondary.id],
    });

    const result = contacts.merge(userId, primary.id, secondary.id);

    // Secondary's duplicate participant entry should be removed
    const activities = activityService.list(userId, { contact_id: primary.id });
    expect(activities.data).toHaveLength(1);
  });

  it('should reassign life events and life_event_contacts', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    lifeEvents.create(userId, {
      contact_id: secondary.id,
      event_type: 'new_job',
      title: 'Started new job',
    });

    const result = contacts.merge(userId, primary.id, secondary.id);

    expect(result.summary['life_events']).toBe(1);

    // Verify life events are now under primary
    const events = lifeEvents.listByContact(userId, primary.id);
    expect(events.data).toHaveLength(1);
    expect(events.data[0].title).toBe('Started new job');
  });

  it('should handle contact_tags with INSERT OR IGNORE for deduplication', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    // Primary has 'friend' and 'colleague'
    tags.tagContact(userId, primary.id, 'friend');
    tags.tagContact(userId, primary.id, 'colleague');

    // Secondary has 'colleague' (overlap) and 'vip' (unique)
    tags.tagContact(userId, secondary.id, 'colleague');
    tags.tagContact(userId, secondary.id, 'vip');

    const result = contacts.merge(userId, primary.id, secondary.id);

    // Only tag3 should be counted as newly moved (tag2 was a duplicate)
    expect(result.summary['contact_tags']).toBe(1);

    // Primary should now have all 3 tags
    const primaryTags = tags.listByContact(primary.id);
    expect(primaryTags).toHaveLength(3);
    const tagNames = primaryTags.map((t: any) => t.name).sort();
    expect(tagNames).toEqual(['colleague', 'friend', 'vip']);
  });

  it('should prevent self-relationships when merging contacts that have a relationship', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    // Secondary has a relationship to primary
    relationships.add({
      contact_id: secondary.id,
      related_contact_id: primary.id,
      relationship_type: 'friend',
    });

    const result = contacts.merge(userId, primary.id, secondary.id);

    // The relationship should be deleted, not moved (would create self-relationship)
    const primaryRels = relationships.listByContact(primary.id);
    const selfRels = primaryRels.filter(r => r.related_contact_id === primary.id);
    expect(selfRels).toHaveLength(0);
  });

  it('should deduplicate relationships with same third party', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });
    const charlie = contacts.create(userId, { first_name: 'Charlie' });

    // Both have a "friend" relationship with Charlie
    relationships.add({
      contact_id: primary.id,
      related_contact_id: charlie.id,
      relationship_type: 'friend',
    });
    relationships.add({
      contact_id: secondary.id,
      related_contact_id: charlie.id,
      relationship_type: 'friend',
    });

    const result = contacts.merge(userId, primary.id, secondary.id);

    // Primary should still have exactly one relationship with Charlie
    const primaryRels = relationships.listByContact(primary.id);
    const charlieRels = primaryRels.filter(r => r.related_contact_id === charlie.id);
    expect(charlieRels).toHaveLength(1);
    expect(charlieRels[0].relationship_type).toBe('friend');
  });

  it('should move non-duplicate relationships from secondary', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });
    const charlie = contacts.create(userId, { first_name: 'Charlie' });

    // Only secondary has a relationship with Charlie
    relationships.add({
      contact_id: secondary.id,
      related_contact_id: charlie.id,
      relationship_type: 'colleague',
    });

    const result = contacts.merge(userId, primary.id, secondary.id);

    expect(result.summary['relationships']).toBeGreaterThanOrEqual(1);

    // Primary should now have the relationship with Charlie
    const primaryRels = relationships.listByContact(primary.id);
    const charlieRels = primaryRels.filter(r => r.related_contact_id === charlie.id);
    expect(charlieRels).toHaveLength(1);
    expect(charlieRels[0].relationship_type).toBe('colleague');
  });

  it('should merge food_preferences arrays (union)', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    foodPreferences.upsert({
      contact_id: primary.id,
      allergies: ['peanuts'],
      dietary_restrictions: ['vegetarian'],
      favorite_foods: ['pizza'],
      disliked_foods: ['olives'],
    });

    foodPreferences.upsert({
      contact_id: secondary.id,
      allergies: ['peanuts', 'shellfish'],
      dietary_restrictions: ['gluten-free'],
      favorite_foods: ['sushi', 'pizza'],
      disliked_foods: ['mushrooms'],
    });

    contacts.merge(userId, primary.id, secondary.id);

    const merged = foodPreferences.get(primary.id)!;
    expect(merged).not.toBeNull();
    expect(merged.allergies.sort()).toEqual(['peanuts', 'shellfish']);
    expect(merged.dietary_restrictions.sort()).toEqual(['gluten-free', 'vegetarian']);
    expect(merged.favorite_foods.sort()).toEqual(['pizza', 'sushi']);
    expect(merged.disliked_foods.sort()).toEqual(['mushrooms', 'olives']);

    // Secondary should no longer have food preferences
    expect(foodPreferences.get(secondary.id)).toBeNull();
  });

  it('should move food_preferences when only secondary has them', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    foodPreferences.upsert({
      contact_id: secondary.id,
      allergies: ['shellfish'],
      favorite_foods: ['tacos'],
    });

    contacts.merge(userId, primary.id, secondary.id);

    const merged = foodPreferences.get(primary.id)!;
    expect(merged).not.toBeNull();
    expect(merged.allergies).toEqual(['shellfish']);
    expect(merged.favorite_foods).toEqual(['tacos']);
  });

  it('should only copy custom_fields that do not exist on primary', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    customFields.add({ contact_id: primary.id, field_name: 'twitter', field_value: '@alice' });
    customFields.add({ contact_id: secondary.id, field_name: 'twitter', field_value: '@alicia' }); // duplicate name
    customFields.add({ contact_id: secondary.id, field_name: 'github', field_value: 'alice-dev' }); // unique

    const result = contacts.merge(userId, primary.id, secondary.id);

    expect(result.summary['custom_fields']).toBe(1); // only github moved

    const fields = customFields.listByContact(primary.id);
    expect(fields).toHaveLength(2);
    const fieldNames = fields.map(f => f.field_name).sort();
    expect(fieldNames).toEqual(['github', 'twitter']);

    // Primary's twitter value should be preserved (not overwritten)
    const twitterField = fields.find(f => f.field_name === 'twitter')!;
    expect(twitterField.field_value).toBe('@alice');
  });

  it('should copy non-null fields from secondary to primary where primary is null', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, {
      first_name: 'Alicia',
      last_name: 'Smith',
      company: 'Acme Corp',
      job_title: 'Engineer',
      birthday_mode: 'full_date',
      birthday_date: '1990-05-15',
    });

    const result = contacts.merge(userId, primary.id, secondary.id);

    const merged = contacts.get(userId, primary.id)!;
    expect(merged.last_name).toBe('Smith');
    expect(merged.company).toBe('Acme Corp');
    expect(merged.job_title).toBe('Engineer');
    expect(merged.birthday_mode).toBe('full_date');
    expect(merged.birthday_date).toBe('1990-05-15');
    expect(result.summary['fields_copied']).toBeGreaterThanOrEqual(4);
  });

  it('should not overwrite non-null fields on primary', () => {
    const primary = contacts.create(userId, {
      first_name: 'Alice',
      company: 'Primary Corp',
    });
    const secondary = contacts.create(userId, {
      first_name: 'Alicia',
      company: 'Secondary Corp',
      job_title: 'Manager',
    });

    contacts.merge(userId, primary.id, secondary.id);

    const merged = contacts.get(userId, primary.id)!;
    expect(merged.company).toBe('Primary Corp'); // not overwritten
    expect(merged.job_title).toBe('Manager'); // copied since primary was null
  });

  it('should soft-delete the secondary contact after merge', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    contacts.merge(userId, primary.id, secondary.id);

    // Secondary should be soft-deleted
    const deletedSecondary = contacts.get(userId, secondary.id);
    expect(deletedSecondary).toBeNull();

    // Primary should still be active
    const activePrimary = contacts.get(userId, primary.id);
    expect(activePrimary).not.toBeNull();
  });

  it('should return the merged primary contact with summary', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    notes.create(userId, { contact_id: secondary.id, body: 'Note', title: 'Test' });

    const result = contacts.merge(userId, primary.id, secondary.id);

    expect(result.contact).toBeDefined();
    expect(result.contact.id).toBe(primary.id);
    expect(result.contact.first_name).toBe('Alice');
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe('object');
  });

  it('should throw error when merging a contact with itself', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });

    expect(() => contacts.merge(userId, primary.id, primary.id)).toThrow(
      'Cannot merge a contact with itself'
    );
  });

  it('should throw error when primary contact not found', () => {
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    expect(() => contacts.merge(userId, 'nonexistent', secondary.id)).toThrow(
      'Primary contact not found'
    );
  });

  it('should throw error when secondary contact not found', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });

    expect(() => contacts.merge(userId, primary.id, 'nonexistent')).toThrow(
      'Secondary contact not found'
    );
  });

  it('should not allow merging contacts belonging to another user', () => {
    const otherUserId = createTestUser(db, { email: 'other@example.com' });
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const otherContact = contacts.create(otherUserId, { first_name: 'Bob' });

    expect(() => contacts.merge(userId, primary.id, otherContact.id)).toThrow(
      'Secondary contact not found'
    );

    expect(() => contacts.merge(userId, otherContact.id, primary.id)).toThrow(
      'Primary contact not found'
    );
  });

  it('should handle merge when secondary has no child entities', () => {
    const primary = contacts.create(userId, { first_name: 'Alice' });
    const secondary = contacts.create(userId, { first_name: 'Alicia' });

    const result = contacts.merge(userId, primary.id, secondary.id);

    expect(result.contact.id).toBe(primary.id);
    // Summary should have few or no entries
    const totalMoved = Object.values(result.summary).reduce((a, b) => a + b, 0);
    expect(totalMoved).toBe(0);

    // Secondary should be soft-deleted
    expect(contacts.get(userId, secondary.id)).toBeNull();
  });
});

describe('ContactService.findDuplicates', () => {
  let db: Database.Database;
  let contacts: ContactService;
  let contactMethods: ContactMethodService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    contacts = new ContactService(db);
    contactMethods = new ContactMethodService(db);
    userId = createTestUser(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  it('should find duplicates with same first and last name', () => {
    contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].reason).toBe('same name');
  });

  it('should find duplicates with case-insensitive name matching', () => {
    contacts.create(userId, { first_name: 'alice', last_name: 'smith' });
    contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].reason).toBe('same name');
  });

  it('should not flag contacts with same first name but different last names', () => {
    contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    contacts.create(userId, { first_name: 'Alice', last_name: 'Jones' });

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(0);
  });

  it('should not flag contacts with same first name but no last name', () => {
    contacts.create(userId, { first_name: 'Alice' });
    contacts.create(userId, { first_name: 'Alice' });

    const result = contacts.findDuplicates(userId);

    // Should not match since both have empty last names (could be coincidental)
    expect(result.data).toHaveLength(0);
  });

  it('should find duplicates with same email address', () => {
    const c1 = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    const c2 = contacts.create(userId, { first_name: 'A.', last_name: 'Smith' });

    contactMethods.add({ contact_id: c1.id, type: 'email', value: 'alice@example.com' });
    contactMethods.add({ contact_id: c2.id, type: 'email', value: 'alice@example.com' });

    const result = contacts.findDuplicates(userId);

    const emailMatch = result.data.find(d => d.reason.includes('same email'));
    expect(emailMatch).toBeDefined();
    expect(emailMatch!.reason).toContain('alice@example.com');
  });

  it('should find duplicates with same phone number', () => {
    const c1 = contacts.create(userId, { first_name: 'Alice' });
    const c2 = contacts.create(userId, { first_name: 'Alicia' });

    contactMethods.add({ contact_id: c1.id, type: 'phone', value: '+1-555-0123' });
    contactMethods.add({ contact_id: c2.id, type: 'phone', value: '15550123' });

    const result = contacts.findDuplicates(userId);

    const phoneMatch = result.data.find(d => d.reason.includes('same phone'));
    expect(phoneMatch).toBeDefined();
  });

  it('should not find duplicates across different users', () => {
    const otherUserId = createTestUser(db, { email: 'other@example.com' });

    contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    contacts.create(otherUserId, { first_name: 'Alice', last_name: 'Smith' });

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(0);
  });

  it('should not include soft-deleted contacts in duplicates', () => {
    const c1 = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    const c2 = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });

    contacts.softDelete(userId, c2.id);

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(0);
  });

  it('should return empty results when no duplicates exist', () => {
    contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    contacts.create(userId, { first_name: 'Bob', last_name: 'Jones' });
    contacts.create(userId, { first_name: 'Charlie', last_name: 'Brown' });

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should limit results to 20', () => {
    // Create many duplicate pairs (more than 20)
    for (let i = 0; i < 25; i++) {
      contacts.create(userId, { first_name: `Person${i}`, last_name: 'Duplicate' });
      contacts.create(userId, { first_name: `Person${i}`, last_name: 'Duplicate' });
    }

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(20);
    expect(result.total).toBe(25);
  });

  it('should include contact IDs and names in results', () => {
    const c1 = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    const c2 = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });

    const result = contacts.findDuplicates(userId);

    expect(result.data).toHaveLength(1);
    const match = result.data[0];
    expect(match.contact_id_1).toBeDefined();
    expect(match.contact_id_2).toBeDefined();
    expect(match.contact_name_1).toContain('Alice');
    expect(match.contact_name_2).toContain('Alice');
    expect([match.contact_id_1, match.contact_id_2].sort()).toEqual([c1.id, c2.id].sort());
  });

  it('should find multiple match reasons for the same pair', () => {
    const c1 = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });
    const c2 = contacts.create(userId, { first_name: 'Alice', last_name: 'Smith' });

    contactMethods.add({ contact_id: c1.id, type: 'email', value: 'alice@example.com' });
    contactMethods.add({ contact_id: c2.id, type: 'email', value: 'alice@example.com' });

    const result = contacts.findDuplicates(userId);

    // Should have at least 2 entries for this pair: same name + same email
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    const reasons = result.data.map(d => d.reason);
    expect(reasons).toContain('same name');
    expect(reasons.some(r => r.includes('same email'))).toBe(true);
  });
});
