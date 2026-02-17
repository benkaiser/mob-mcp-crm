import { describe, it, expect } from 'vitest';
import { ForgetfulTemplate } from '../../src/db/forgetful-template.js';

describe('ForgetfulTemplate', () => {
  it('constructs without error', () => {
    const template = new ForgetfulTemplate();
    expect(template).toBeDefined();
  });

  it('clone returns a database with the new userId', () => {
    const template = new ForgetfulTemplate();
    const userId = 'test-user-001';
    const db = template.clone(userId);

    // User should exist with the new ID
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId) as any;
    expect(user).toBeDefined();
    expect(user.name).toBe('Bluey Heeler');
    expect(user.email).toBe(`forgetful-${userId}@mob.local`);

    // Template user should NOT exist
    const templateUser = db.prepare("SELECT id FROM users WHERE id = '__TEMPLATE__'").get();
    expect(templateUser).toBeUndefined();

    db.close();
  });

  it('clone remaps all user_id references to new userId', () => {
    const template = new ForgetfulTemplate();
    const userId = 'test-user-002';
    const db = template.clone(userId);

    // Contacts should belong to the new user
    const contacts = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE user_id = ?').get(userId) as any;
    expect(contacts.c).toBe(20);

    // No contacts should belong to __TEMPLATE__
    const templateContacts = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE user_id = '__TEMPLATE__'").get() as any;
    expect(templateContacts.c).toBe(0);

    // Tags should belong to the new user
    const tags = db.prepare('SELECT COUNT(*) as c FROM tags WHERE user_id = ?').get(userId) as any;
    expect(tags.c).toBe(4);

    // Activities should belong to the new user
    const activities = db.prepare('SELECT COUNT(*) as c FROM activities WHERE user_id = ?').get(userId) as any;
    expect(activities.c).toBe(4);

    db.close();
  });

  it('clones produce isolated databases', () => {
    const template = new ForgetfulTemplate();

    const db1 = template.clone('user-a');
    const db2 = template.clone('user-b');

    // Both should have 20 contacts
    const count1 = (db1.prepare("SELECT COUNT(*) as c FROM contacts WHERE user_id = 'user-a'").get() as any).c;
    const count2 = (db2.prepare("SELECT COUNT(*) as c FROM contacts WHERE user_id = 'user-b'").get() as any).c;
    expect(count1).toBe(20);
    expect(count2).toBe(20);

    // Delete a contact from db1 — should not affect db2
    const contact1 = db1.prepare("SELECT id FROM contacts WHERE user_id = 'user-a' LIMIT 1").get() as any;
    db1.prepare('DELETE FROM contacts WHERE id = ?').run(contact1.id);

    const newCount1 = (db1.prepare("SELECT COUNT(*) as c FROM contacts WHERE user_id = 'user-a'").get() as any).c;
    const newCount2 = (db2.prepare("SELECT COUNT(*) as c FROM contacts WHERE user_id = 'user-b'").get() as any).c;
    expect(newCount1).toBe(19);
    expect(newCount2).toBe(20); // Unaffected

    db1.close();
    db2.close();
  });

  it('cloned DB has foreign keys enabled', () => {
    const template = new ForgetfulTemplate();
    const db = template.clone('user-fk-test');

    const fkStatus = db.pragma('foreign_keys') as any[];
    expect(fkStatus[0].foreign_keys).toBe(1);

    db.close();
  });

  it('cloned DB has all seed data entities', () => {
    const template = new ForgetfulTemplate();
    const userId = 'user-data-check';
    const db = template.clone(userId);

    // Relationships
    const rels = (db.prepare('SELECT COUNT(*) as c FROM relationships').get() as any).c;
    expect(rels).toBe(24);

    // Contact methods
    const methods = (db.prepare('SELECT COUNT(*) as c FROM contact_methods').get() as any).c;
    expect(methods).toBe(9);

    // Addresses
    const addrs = (db.prepare('SELECT COUNT(*) as c FROM addresses').get() as any).c;
    expect(addrs).toBe(4);

    // Notes
    const notes = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as any).c;
    expect(notes).toBe(5);

    // Activities
    const acts = (db.prepare('SELECT COUNT(*) as c FROM activities WHERE user_id = ?').get(userId) as any).c;
    expect(acts).toBe(4);

    // Activity participants
    const parts = (db.prepare('SELECT COUNT(*) as c FROM activity_participants').get() as any).c;
    expect(parts).toBe(12); // 3 + 3 + 1 + 5

    // Food preferences
    const fps = (db.prepare('SELECT COUNT(*) as c FROM food_preferences').get() as any).c;
    expect(fps).toBe(2);

    // Life events
    const les = (db.prepare('SELECT COUNT(*) as c FROM life_events').get() as any).c;
    expect(les).toBe(2);

    // Reminders
    const rems = (db.prepare('SELECT COUNT(*) as c FROM reminders').get() as any).c;
    expect(rems).toBe(4);

    // Gifts
    const gifts = (db.prepare('SELECT COUNT(*) as c FROM gifts').get() as any).c;
    expect(gifts).toBe(2);

    db.close();
  });
});
