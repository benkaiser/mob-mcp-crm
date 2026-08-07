import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditService } from '../../src/services/audit.js';
import { ContactService } from '../../src/services/contacts.js';
import { NoteService } from '../../src/services/notes.js';
import { ActivityService } from '../../src/services/activities.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('AuditService', () => {
  let db: Database.Database;
  let audit: AuditService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    userId = createTestUser(db);
    audit = new AuditService(db);
  });

  afterEach(() => closeDatabase(db));

  it('records contact create, update and delete with old and new values', () => {
    const contacts = new ContactService(db);
    const contact = contacts.create(userId, { first_name: 'Jean' });
    contacts.update(userId, contact.id, { last_name: 'Grey' });
    contacts.softDelete(userId, contact.id);

    const entries = audit.list(userId, { page: 1, per_page: 10 }).data;
    expect(entries.map((e) => e.action)).toEqual(['delete', 'update', 'create']);
    expect(entries[0].entity_type).toBe('contact');
    expect(entries[0].old_values?.first_name).toBe('Jean');
    expect(entries[0].new_values).toBeNull();
    expect(entries[1].old_values?.last_name).toBeNull();
    expect(entries[1].new_values?.last_name).toBe('Grey');
  });

  it('records representative contact-owned entity create, update and delete', () => {
    const contactId = createTestContact(db, userId);
    const notes = new NoteService(db);

    const note = notes.create(userId, { contact_id: contactId, body: 'Original' });
    notes.update(userId, note.id, { body: 'Updated' });
    notes.softDelete(userId, note.id);

    const entries = audit.list(userId, { page: 1, per_page: 10 }).data;
    expect(entries.map((e) => `${e.entity_type}:${e.action}`)).toEqual([
      'note:delete',
      'note:update',
      'note:create',
    ]);
    expect(entries[1].old_values?.body).toBe('Original');
    expect(entries[1].new_values?.body).toBe('Updated');
  });

  it('paginates newest-first', () => {
    for (let i = 0; i < 3; i++) {
      audit.record(userId, { entity_type: 'test', entity_id: `e${i}`, action: 'create', new_values: { i } });
    }

    const page1 = audit.list(userId, { page: 1, per_page: 2 });
    const page2 = audit.list(userId, { page: 2, per_page: 2 });

    expect(page1.total).toBe(3);
    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(1);
    expect(page1.data[0].created_at >= page1.data[1].created_at).toBe(true);
  });

  it('returns an inactive seven-day streak when there is no activity', () => {
    const streak = audit.getStreak(userId);
    expect(streak.days).toHaveLength(7);
    expect(streak.days.every((d) => d.active === false)).toBe(true);
    expect(streak.current_streak).toBe(0);
  });

  it('counts a single active day streak', () => {
    insertAuditOnLocalDay(db, userId, todayLocal());

    const streak = audit.getStreak(userId);
    expect(streak.days.at(-1)?.active).toBe(true);
    expect(streak.current_streak).toBe(1);
  });

  it('counts consecutive multi-day streaks', () => {
    const today = todayLocal();
    insertAuditOnLocalDay(db, userId, today);
    insertAuditOnLocalDay(db, userId, addDays(today, -1));
    insertAuditOnLocalDay(db, userId, addDays(today, -2));

    expect(audit.getStreak(userId).current_streak).toBe(3);
  });

  it('breaks the current streak at a gap', () => {
    const today = todayLocal();
    insertAuditOnLocalDay(db, userId, today);
    insertAuditOnLocalDay(db, userId, addDays(today, -2));

    const streak = audit.getStreak(userId);
    expect(streak.current_streak).toBe(1);
    expect(streak.days.at(-2)?.active).toBe(false);
  });

  it('buckets audit days by the user timezone', () => {
    db.prepare('INSERT INTO user_settings (user_id, timezone) VALUES (?, ?)').run(userId, 'Pacific/Kiritimati');
    const todayInZone = localDateInZone(new Date(), 'Pacific/Kiritimati');
    db.prepare(`
      INSERT INTO audit_logs (user_id, entity_type, entity_id, action, created_at)
      VALUES (?, 'test', 'late-utc', 'create', ?)
    `).run(userId, `${addDays(todayInZone, -1)} 11:30:00`);

    const streak = audit.getStreak(userId);
    expect(streak.days.at(-1)).toEqual({ date: todayInZone, active: true });
  });

  it('lists recently interacted contacts, newest first, one row per contact', () => {
    const contacts = new ContactService(db);
    const notes = new NoteService(db);
    const activities = new ActivityService(db);

    const alice = contacts.create(userId, { first_name: 'Alice' });
    const bob = contacts.create(userId, { first_name: 'Bob' });
    const carol = contacts.create(userId, { first_name: 'Carol' });

    // Interact in a known order: edit Alice, note on Bob, activity with Carol,
    // then a second edit of Alice (making Alice the most recent).
    contacts.update(userId, alice.id, { last_name: 'Anderson' });
    notes.create(userId, { contact_id: bob.id, body: 'Likes tea' });
    activities.create(userId, { type: 'in_person', occurred_at: '2026-01-01T00:00:00.000Z', participant_contact_ids: [carol.id] });
    contacts.update(userId, alice.id, { nickname: 'Al' });

    const recent = audit.recentContacts(userId, 5);
    expect(recent.map((r) => r.contact_id)).toEqual([alice.id, carol.id, bob.id]);
    // One row per contact (Alice edited twice but appears once) with her latest action.
    expect(recent[0].last_entity_type).toBe('contact');
    expect(recent[0].last_action).toBe('update');
    // Activity participation resolves to the contact.
    expect(recent[1].last_entity_type).toBe('activity');
    expect(recent[1].first_name).toBe('Carol');
  });

  it('excludes soft-deleted contacts and respects the limit', () => {
    const contacts = new ContactService(db);
    const keep = contacts.create(userId, { first_name: 'Keep' });
    const gone = contacts.create(userId, { first_name: 'Gone' });
    contacts.update(userId, gone.id, { last_name: 'Zone' });
    contacts.softDelete(userId, gone.id);

    const recent = audit.recentContacts(userId, 5);
    const ids = recent.map((r) => r.contact_id);
    expect(ids).toContain(keep.id);
    expect(ids).not.toContain(gone.id);
    expect(audit.recentContacts(userId, 1).length).toBe(1);
  });
});

function insertAuditOnLocalDay(db: Database.Database, userId: string, date: string): void {
  db.prepare(`
    INSERT INTO audit_logs (user_id, entity_type, entity_id, action, created_at)
    VALUES (?, 'test', ?, 'create', ?)
  `).run(userId, date, `${date} 12:00:00`);
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function localDateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}-${parts.find((p) => p.type === 'day')?.value}`;
}
