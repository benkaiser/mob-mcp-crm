import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { seedForgetfulData } from '../../src/db/seed-data.js';

describe('seedForgetfulData', () => {
  let db: Database.Database;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    userId = createTestUser(db, { name: 'Bluey Heeler', email: 'bluey@heeler.family' });
    seedForgetfulData(db, userId);
  });

  it('creates exactly 20 contacts', () => {
    const count = (db.prepare('SELECT COUNT(*) as c FROM contacts WHERE user_id = ?').get(userId) as any).c;
    expect(count).toBe(20);
  });

  it('creates 4 tags (Family, Friends, School, Neighbours)', () => {
    const tags = db.prepare('SELECT name, color FROM tags WHERE user_id = ? ORDER BY name').all(userId) as any[];
    expect(tags).toHaveLength(4);
    expect(tags.map(t => t.name)).toEqual(['Family', 'Friends', 'Neighbours', 'School']);
    expect(tags.find(t => t.name === 'Family').color).toBe('#E74C3C');
    expect(tags.find(t => t.name === 'Friends').color).toBe('#3498DB');
    expect(tags.find(t => t.name === 'School').color).toBe('#2ECC71');
    expect(tags.find(t => t.name === 'Neighbours').color).toBe('#F39C12');
  });

  it('tags contacts correctly', () => {
    const familyTagId = (db.prepare("SELECT id FROM tags WHERE user_id = ? AND name = 'Family'").get(userId) as any).id;
    const familyContacts = db.prepare(`
      SELECT c.first_name FROM contacts c
      JOIN contact_tags ct ON c.id = ct.contact_id
      WHERE ct.tag_id = ? ORDER BY c.first_name
    `).all(familyTagId) as any[];
    expect(familyContacts.map(c => c.first_name)).toEqual([
      'Bandit', 'Bingo', 'Bob', 'Chilli', 'Chris', 'Frisky', 'Muffin', 'Rad', 'Socks', 'Stripe', 'Trixie'
    ]);
  });

  it('creates bidirectional relationships', () => {
    const relCount = (db.prepare('SELECT COUNT(*) as c FROM relationships').get() as any).c;
    // 12 relationship pairs = 24 relationship rows
    expect(relCount).toBe(24);

    // Check a specific relationship: Bandit <-> Chilli spouse
    const banditId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Bandit' AND user_id = ?").get(userId) as any).id;
    const chilliId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Chilli' AND user_id = ?").get(userId) as any).id;

    const banditToChilli = db.prepare(
      "SELECT relationship_type FROM relationships WHERE contact_id = ? AND related_contact_id = ?"
    ).get(banditId, chilliId) as any;
    expect(banditToChilli.relationship_type).toBe('spouse');

    const chilliToBandit = db.prepare(
      "SELECT relationship_type FROM relationships WHERE contact_id = ? AND related_contact_id = ?"
    ).get(chilliId, banditId) as any;
    expect(chilliToBandit.relationship_type).toBe('spouse');
  });

  it('creates contact methods', () => {
    const methods = db.prepare('SELECT COUNT(*) as c FROM contact_methods').get() as any;
    // Bandit(2) + Chilli(2) + Stripe(1) + Trixie(1) + Rad(2) + Calypso(1) = 9
    expect(methods.c).toBe(9);

    // Check Bandit's phone
    const banditId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Bandit' AND user_id = ?").get(userId) as any).id;
    const banditPhone = db.prepare(
      "SELECT value FROM contact_methods WHERE contact_id = ? AND type = 'phone'"
    ).get(banditId) as any;
    expect(banditPhone.value).toBe('+61 412 345 001');
  });

  it('creates addresses', () => {
    const addrCount = (db.prepare('SELECT COUNT(*) as c FROM addresses').get() as any).c;
    // Bandit(1) + Chilli(1) + Stripe(1) + Rusty(1) = 4
    expect(addrCount).toBe(4);

    // Verify Rusty's farm address
    const rustyId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Rusty' AND user_id = ?").get(userId) as any).id;
    const rustyAddr = db.prepare('SELECT * FROM addresses WHERE contact_id = ?').get(rustyId) as any;
    expect(rustyAddr.label).toBe('Farm');
    expect(rustyAddr.street_line_1).toBe('42 Outback Rd');
    expect(rustyAddr.city).toBe('Longreach');
  });

  it('creates notes for 5 contacts', () => {
    const noteCount = (db.prepare('SELECT COUNT(*) as c FROM notes').get() as any).c;
    expect(noteCount).toBe(5);

    // Check Bandit's note
    const banditId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Bandit' AND user_id = ?").get(userId) as any).id;
    const banditNote = db.prepare('SELECT body FROM notes WHERE contact_id = ?').get(banditId) as any;
    expect(banditNote.body).toContain('Shadowlands');
  });

  it('creates 4 activities with correct participants', () => {
    const actCount = (db.prepare('SELECT COUNT(*) as c FROM activities WHERE user_id = ?').get(userId) as any).c;
    expect(actCount).toBe(4);

    // Check "Played Keepy Uppy" has 3 participants
    const keepyUppy = db.prepare(
      "SELECT id FROM activities WHERE title = 'Played Keepy Uppy' AND user_id = ?"
    ).get(userId) as any;
    const participants = db.prepare(
      'SELECT COUNT(*) as c FROM activity_participants WHERE activity_id = ?'
    ).get(keepyUppy.id) as any;
    expect(participants.c).toBe(3);
  });

  it('creates food preferences for Bingo and Muffin', () => {
    const fpCount = (db.prepare('SELECT COUNT(*) as c FROM food_preferences').get() as any).c;
    expect(fpCount).toBe(2);

    const bingoId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Bingo' AND user_id = ?").get(userId) as any).id;
    const bingoFp = db.prepare('SELECT * FROM food_preferences WHERE contact_id = ?').get(bingoId) as any;
    expect(JSON.parse(bingoFp.favorite_foods)).toEqual(['peas', 'fairy bread']);
    expect(JSON.parse(bingoFp.disliked_foods)).toEqual(['mushrooms']);
  });

  it('creates 2 life events', () => {
    const leCount = (db.prepare('SELECT COUNT(*) as c FROM life_events').get() as any).c;
    expect(leCount).toBe(2);

    const friskyId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Frisky' AND user_id = ?").get(userId) as any).id;
    const friskyEvent = db.prepare('SELECT * FROM life_events WHERE contact_id = ?').get(friskyId) as any;
    expect(friskyEvent.event_type).toBe('engagement');
    expect(friskyEvent.title).toBe('Got engaged!');
  });

  it('creates 4 reminders (3 birthday + 1 custom)', () => {
    const remCount = (db.prepare('SELECT COUNT(*) as c FROM reminders').get() as any).c;
    expect(remCount).toBe(4);

    const autoReminders = db.prepare('SELECT COUNT(*) as c FROM reminders WHERE is_auto_generated = 1').get() as any;
    expect(autoReminders.c).toBe(3);

    const customReminders = db.prepare('SELECT COUNT(*) as c FROM reminders WHERE is_auto_generated = 0').get() as any;
    expect(customReminders.c).toBe(1);

    // Check the Mackenzie playdate reminder
    const mackId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Mackenzie' AND user_id = ?").get(userId) as any).id;
    const playdateReminder = db.prepare('SELECT * FROM reminders WHERE contact_id = ?').get(mackId) as any;
    expect(playdateReminder.title).toBe('Plan next playdate');
    expect(playdateReminder.frequency).toBe('one_time');
  });

  it('creates 2 gifts', () => {
    const giftCount = (db.prepare('SELECT COUNT(*) as c FROM gifts').get() as any).c;
    expect(giftCount).toBe(2);

    const bingoId = (db.prepare("SELECT id FROM contacts WHERE first_name = 'Bingo' AND user_id = ?").get(userId) as any).id;
    const bingoGift = db.prepare('SELECT * FROM gifts WHERE contact_id = ?').get(bingoId) as any;
    expect(bingoGift.name).toBe('New Floppy bunny plush');
    expect(bingoGift.status).toBe('idea');
    expect(bingoGift.direction).toBe('giving');
  });

  it('marks Bandit, Chilli, and Bingo as favorites', () => {
    const favorites = db.prepare(
      'SELECT first_name FROM contacts WHERE user_id = ? AND is_favorite = 1 ORDER BY first_name'
    ).all(userId) as any[];
    expect(favorites.map(f => f.first_name)).toEqual(['Bandit', 'Bingo', 'Chilli']);
  });

  it('sets work info for Bandit, Chilli, and Calypso', () => {
    const bandit = db.prepare("SELECT job_title, company FROM contacts WHERE first_name = 'Bandit' AND user_id = ?").get(userId) as any;
    expect(bandit.job_title).toBe('Archaeologist');
    expect(bandit.company).toBe('University of Queensland');

    const calypso = db.prepare("SELECT job_title, company FROM contacts WHERE first_name = 'Calypso' AND user_id = ?").get(userId) as any;
    expect(calypso.job_title).toBe('Teacher');
    expect(calypso.company).toBe('Glebe Hill School');
  });
});
