import type Database from 'better-sqlite3';
import { generateId } from '../utils.js';

/**
 * Seeds a database with Bluey-themed contacts and rich sub-entity data
 * for forgetful mode. The user (Bluey Heeler) is the current user,
 * and all other characters are contacts with relationships, notes,
 * activities, tags, contact methods, addresses, food preferences,
 * reminders, life events, and gifts.
 */
export function seedForgetfulData(db: Database.Database, userId: string): void {
  // ─── Tags ───────────────────────────────────────────────────────
  const tagFamily = generateId();
  const tagFriends = generateId();
  const tagSchool = generateId();
  const tagNeighbours = generateId();

  const insertTag = db.prepare(
    'INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)'
  );
  insertTag.run(tagFamily, userId, 'Family', '#E74C3C');
  insertTag.run(tagFriends, userId, 'Friends', '#3498DB');
  insertTag.run(tagSchool, userId, 'School', '#2ECC71');
  insertTag.run(tagNeighbours, userId, 'Neighbours', '#F39C12');

  // ─── Contacts ───────────────────────────────────────────────────
  const insertContact = db.prepare(`
    INSERT INTO contacts (id, user_id, first_name, last_name, nickname, birthday_mode, birthday_date, birthday_month, birthday_day, is_favorite, job_title, company, work_notes, met_description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const bandit = generateId();
  const chilli = generateId();
  const bingo = generateId();
  const stripe = generateId();
  const trixie = generateId();
  const muffin = generateId();
  const socks = generateId();
  const rad = generateId();
  const chris = generateId();
  const bob = generateId();
  const frisky = generateId();
  const mackenzie = generateId();
  const rusty = generateId();
  const judo = generateId();
  const chloe = generateId();
  const honey = generateId();
  const snickers = generateId();
  const calypso = generateId();
  const lucky = generateId();
  const jack = generateId();

  // 1. Bandit Heeler — Dad, archaeologist at UQ, birthday Nov 19, favorite
  insertContact.run(bandit, userId, 'Bandit', 'Heeler', null, 'month_day', null, 11, 19, 1, 'Archaeologist', 'University of Queensland', null, null);
  // 2. Chilli Heeler — Mum, airport security part-time, birthday Sep 6, favorite
  insertContact.run(chilli, userId, 'Chilli', 'Heeler', null, 'month_day', null, 9, 6, 1, 'Airport Security Officer', 'Brisbane Airport', 'Part-time', null);
  // 3. Bingo Heeler — Little sister, birthday Jul 24, favorite
  insertContact.run(bingo, userId, 'Bingo', 'Heeler', null, 'month_day', null, 7, 24, 1, null, null, null, null);
  // 4. Stripe Heeler — Uncle (Bandit's brother)
  insertContact.run(stripe, userId, 'Stripe', 'Heeler', null, null, null, null, null, 0, null, null, null, null);
  // 5. Trixie Heeler — Aunt (Stripe's wife)
  insertContact.run(trixie, userId, 'Trixie', 'Heeler', null, null, null, null, null, 0, null, null, null, null);
  // 6. Muffin Heeler — Cousin, toddler
  insertContact.run(muffin, userId, 'Muffin', 'Heeler', null, null, null, null, null, 0, null, null, null, null);
  // 7. Socks Heeler — Cousin, acts like a puppy
  insertContact.run(socks, userId, 'Socks', 'Heeler', null, null, null, null, null, 0, null, null, null, null);
  // 8. Rad Heeler — Uncle, extreme sports, lives overseas
  insertContact.run(rad, userId, 'Rad', 'Heeler', null, null, null, null, null, 0, null, null, 'Extreme sports enthusiast, lives overseas', null);
  // 9. Chris Heeler — Grandmother, nickname "Nana"
  insertContact.run(chris, userId, 'Chris', 'Heeler', 'Nana', null, null, null, null, 0, null, null, null, null);
  // 10. Bob Heeler — Grandfather
  insertContact.run(bob, userId, 'Bob', 'Heeler', null, null, null, null, null, 0, null, null, null, null);
  // 11. Frisky — Aunt (Chilli's sister), engaged to Rad, nickname "Aunt Frisky"
  insertContact.run(frisky, userId, 'Frisky', null, 'Aunt Frisky', null, null, null, null, 0, null, null, null, null);
  // 12. Mackenzie — School friend, from New Zealand
  insertContact.run(mackenzie, userId, 'Mackenzie', null, null, null, null, null, null, 0, null, null, null, 'School friend from New Zealand');
  // 13. Rusty — School friend, lives on a farm
  insertContact.run(rusty, userId, 'Rusty', null, null, null, null, null, null, 0, null, null, null, 'School friend who lives on a farm');
  // 14. Judo — Neighbour & friend, competitive
  insertContact.run(judo, userId, 'Judo', null, null, null, null, null, null, 0, null, null, null, 'Neighbour, quite competitive');
  // 15. Chloe — School friend, dalmatian, gentle
  insertContact.run(chloe, userId, 'Chloe', null, null, null, null, null, null, 0, null, null, null, 'School friend, very gentle');
  // 16. Honey — School friend, shy
  insertContact.run(honey, userId, 'Honey', null, null, null, null, null, null, 0, null, null, null, 'School friend, quite shy');
  // 17. Snickers — School friend
  insertContact.run(snickers, userId, 'Snickers', null, null, null, null, null, null, 0, null, null, null, 'School friend');
  // 18. Calypso — Teacher at Glebe Hill School
  insertContact.run(calypso, userId, 'Calypso', null, null, null, null, null, null, 0, 'Teacher', 'Glebe Hill School', null, null);
  // 19. Lucky — Next-door neighbour, labrador
  insertContact.run(lucky, userId, 'Lucky', null, null, null, null, null, null, 0, null, null, null, 'Next-door neighbour');
  // 20. Jack — School friend, had to move away
  insertContact.run(jack, userId, 'Jack', null, null, null, null, null, null, 0, null, null, null, 'School friend who had to move away');

  // ─── Contact Tags ───────────────────────────────────────────────
  const insertContactTag = db.prepare(
    'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)'
  );

  // Family
  for (const id of [bandit, chilli, bingo, stripe, trixie, muffin, socks, rad, chris, bob, frisky]) {
    insertContactTag.run(id, tagFamily);
  }
  // Friends
  for (const id of [mackenzie, rusty, judo, chloe, honey, snickers, jack]) {
    insertContactTag.run(id, tagFriends);
  }
  // School
  for (const id of [mackenzie, rusty, chloe, honey, snickers, jack, calypso]) {
    insertContactTag.run(id, tagSchool);
  }
  // Neighbours
  for (const id of [judo, lucky]) {
    insertContactTag.run(id, tagNeighbours);
  }

  // ─── Relationships ──────────────────────────────────────────────
  const insertRelationship = db.prepare(
    'INSERT INTO relationships (id, contact_id, related_contact_id, relationship_type) VALUES (?, ?, ?, ?)'
  );

  // Bandit <-> Chilli: married (spouse/spouse)
  insertRelationship.run(generateId(), bandit, chilli, 'spouse');
  insertRelationship.run(generateId(), chilli, bandit, 'spouse');

  // Bandit <-> Bingo: parent/child
  insertRelationship.run(generateId(), bandit, bingo, 'parent');
  insertRelationship.run(generateId(), bingo, bandit, 'child');

  // Chilli <-> Bingo: parent/child
  insertRelationship.run(generateId(), chilli, bingo, 'parent');
  insertRelationship.run(generateId(), bingo, chilli, 'child');

  // Stripe <-> Bandit: sibling
  insertRelationship.run(generateId(), stripe, bandit, 'sibling');
  insertRelationship.run(generateId(), bandit, stripe, 'sibling');

  // Stripe <-> Trixie: married
  insertRelationship.run(generateId(), stripe, trixie, 'spouse');
  insertRelationship.run(generateId(), trixie, stripe, 'spouse');

  // Muffin <-> Stripe: child/parent
  insertRelationship.run(generateId(), muffin, stripe, 'child');
  insertRelationship.run(generateId(), stripe, muffin, 'parent');

  // Socks <-> Stripe: child/parent
  insertRelationship.run(generateId(), socks, stripe, 'child');
  insertRelationship.run(generateId(), stripe, socks, 'parent');

  // Rad <-> Bandit: sibling
  insertRelationship.run(generateId(), rad, bandit, 'sibling');
  insertRelationship.run(generateId(), bandit, rad, 'sibling');

  // Chris <-> Bandit: parent/child (Chris is Bandit's mum)
  insertRelationship.run(generateId(), chris, bandit, 'parent');
  insertRelationship.run(generateId(), bandit, chris, 'child');

  // Bob <-> Bandit: parent/child (Bob is Bandit's dad)
  insertRelationship.run(generateId(), bob, bandit, 'parent');
  insertRelationship.run(generateId(), bandit, bob, 'child');

  // Frisky <-> Chilli: sibling
  insertRelationship.run(generateId(), frisky, chilli, 'sibling');
  insertRelationship.run(generateId(), chilli, frisky, 'sibling');

  // Frisky <-> Rad: significant_other (engaged)
  insertRelationship.run(generateId(), frisky, rad, 'significant_other');
  insertRelationship.run(generateId(), rad, frisky, 'significant_other');

  // ─── Contact Methods ────────────────────────────────────────────
  const insertContactMethod = db.prepare(
    'INSERT INTO contact_methods (id, contact_id, type, value, label, is_primary) VALUES (?, ?, ?, ?, ?, ?)'
  );

  // Bandit: phone + email
  insertContactMethod.run(generateId(), bandit, 'phone', '+61 412 345 001', 'Mobile', 1);
  insertContactMethod.run(generateId(), bandit, 'email', 'bandit@heeler.family', 'Personal', 0);
  // Chilli: phone + email
  insertContactMethod.run(generateId(), chilli, 'phone', '+61 412 345 002', 'Mobile', 1);
  insertContactMethod.run(generateId(), chilli, 'email', 'chilli@heeler.family', 'Personal', 0);
  // Stripe: phone
  insertContactMethod.run(generateId(), stripe, 'phone', '+61 412 345 003', 'Mobile', 1);
  // Trixie: phone
  insertContactMethod.run(generateId(), trixie, 'phone', '+61 412 345 004', 'Mobile', 1);
  // Rad: phone + email
  insertContactMethod.run(generateId(), rad, 'phone', '+61 412 345 005', 'Mobile', 1);
  insertContactMethod.run(generateId(), rad, 'email', 'rad@heeler.family', 'Personal', 0);
  // Calypso: email
  insertContactMethod.run(generateId(), calypso, 'email', 'calypso@glebehillschool.edu.au', 'School', 1);

  // ─── Addresses ──────────────────────────────────────────────────
  const insertAddress = db.prepare(
    'INSERT INTO addresses (id, contact_id, label, street_line_1, city, state_province, postal_code, country, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  // Bandit & Chilli: same home address
  insertAddress.run(generateId(), bandit, 'Home', '24 Verandah St', 'Brisbane', 'QLD', '4000', 'Australia', 1);
  insertAddress.run(generateId(), chilli, 'Home', '24 Verandah St', 'Brisbane', 'QLD', '4000', 'Australia', 1);
  // Stripe: home
  insertAddress.run(generateId(), stripe, 'Home', '18 Bushland Dr', 'Brisbane', 'QLD', '4000', 'Australia', 1);
  // Rusty: farm
  insertAddress.run(generateId(), rusty, 'Farm', '42 Outback Rd', 'Longreach', 'QLD', '4730', 'Australia', 1);

  // ─── Notes ──────────────────────────────────────────────────────
  const insertNote = db.prepare(
    'INSERT INTO notes (id, contact_id, body) VALUES (?, ?, ?)'
  );

  insertNote.run(generateId(), bandit, 'Always up for a game. His favourite game to play is Shadowlands.');
  insertNote.run(generateId(), bingo, "Loves her stuffed bunny Floppy more than anything. Very imaginative and often plays 'magical' games.");
  insertNote.run(generateId(), muffin, "Can be a bit of a handful when she's tired! Gets the 'grannies' when she skips her nap.");
  insertNote.run(generateId(), calypso, 'The wisest teacher ever. Always has the perfect way to help kids work things out themselves.');
  insertNote.run(generateId(), mackenzie, 'Has the coolest New Zealand accent. Always up for adventure.');

  // ─── Activities + Participants ──────────────────────────────────
  const insertActivity = db.prepare(
    'INSERT INTO activities (id, user_id, type, title, occurred_at, location) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertParticipant = db.prepare(
    'INSERT INTO activity_participants (activity_id, contact_id) VALUES (?, ?)'
  );

  const DAY_MS = 86400000;
  const now = Date.now();

  // 1. "Played Keepy Uppy" — 3 days ago, Bandit + Chilli + Bingo
  const act1 = generateId();
  insertActivity.run(act1, userId, 'in_person', 'Played Keepy Uppy', new Date(now - 3 * DAY_MS).toISOString(), 'Home');
  insertParticipant.run(act1, bandit);
  insertParticipant.run(act1, chilli);
  insertParticipant.run(act1, bingo);

  // 2. "Trip to the Creek" — 7 days ago, Bingo + Mackenzie + Rusty
  const act2 = generateId();
  insertActivity.run(act2, userId, 'in_person', 'Trip to the Creek', new Date(now - 7 * DAY_MS).toISOString(), 'The Creek');
  insertParticipant.run(act2, bingo);
  insertParticipant.run(act2, mackenzie);
  insertParticipant.run(act2, rusty);

  // 3. "Farmers Market with Dad" — 14 days ago, Bandit
  const act3 = generateId();
  insertActivity.run(act3, userId, 'in_person', 'Farmers Market with Dad', new Date(now - 14 * DAY_MS).toISOString(), 'Brisbane Farmers Market');
  insertParticipant.run(act3, bandit);

  // 4. "Sleepover at Muffin's" — 21 days ago, Bingo + Muffin + Socks + Stripe + Trixie
  const act4 = generateId();
  insertActivity.run(act4, userId, 'in_person', "Sleepover at Muffin's", new Date(now - 21 * DAY_MS).toISOString(), "Stripe's house");
  insertParticipant.run(act4, bingo);
  insertParticipant.run(act4, muffin);
  insertParticipant.run(act4, socks);
  insertParticipant.run(act4, stripe);
  insertParticipant.run(act4, trixie);

  // ─── Food Preferences ──────────────────────────────────────────
  const insertFoodPref = db.prepare(
    'INSERT INTO food_preferences (id, contact_id, favorite_foods, disliked_foods, notes) VALUES (?, ?, ?, ?, ?)'
  );

  insertFoodPref.run(generateId(), bingo, JSON.stringify(['peas', 'fairy bread']), JSON.stringify(['mushrooms']), null);
  insertFoodPref.run(generateId(), muffin, JSON.stringify(['chicken nuggets', 'ice cream']), null, 'Very picky eater, good luck!');

  // ─── Life Events ────────────────────────────────────────────────
  const insertLifeEvent = db.prepare(
    'INSERT INTO life_events (id, contact_id, event_type, title, description) VALUES (?, ?, ?, ?, ?)'
  );

  insertLifeEvent.run(generateId(), frisky, 'engagement', 'Got engaged!', 'Frisky and Rad are getting married!');
  insertLifeEvent.run(generateId(), rusty, 'relocation', 'Moved to the farm', null);

  // ─── Reminders ──────────────────────────────────────────────────
  const insertReminder = db.prepare(
    'INSERT INTO reminders (id, contact_id, title, reminder_date, frequency, is_auto_generated) VALUES (?, ?, ?, ?, ?, ?)'
  );

  // Birthday reminders (yearly, auto-generated)
  const thisYear = new Date().getFullYear();
  insertReminder.run(generateId(), bandit, "Bandit's birthday", `${thisYear}-11-19`, 'yearly', 1);
  insertReminder.run(generateId(), chilli, "Chilli's birthday", `${thisYear}-09-06`, 'yearly', 1);
  insertReminder.run(generateId(), bingo, "Bingo's birthday", `${thisYear}-07-24`, 'yearly', 1);

  // Custom reminder: Mackenzie playdate — 1 week from now
  const oneWeekFromNow = new Date(now + 7 * DAY_MS).toISOString().slice(0, 10);
  insertReminder.run(generateId(), mackenzie, 'Plan next playdate', oneWeekFromNow, 'one_time', 0);

  // ─── Gifts ──────────────────────────────────────────────────────
  const insertGift = db.prepare(
    'INSERT INTO gifts (id, contact_id, name, status, direction, occasion) VALUES (?, ?, ?, ?, ?, ?)'
  );

  insertGift.run(generateId(), bingo, 'New Floppy bunny plush', 'idea', 'giving', 'Birthday');
  insertGift.run(generateId(), bandit, 'Surfboard', 'received', 'receiving', 'Birthday');
}
