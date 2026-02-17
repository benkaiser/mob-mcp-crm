import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ReminderService } from '../../src/services/reminders.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ReminderService.getUpcomingReminders', () => {
  let db: Database.Database;
  let service: ReminderService;
  let userId: string;
  let contactId: string;
  let contactId2: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ReminderService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice', lastName: 'Smith' });
    contactId2 = createTestContact(db, userId, { firstName: 'Bob', lastName: 'Jones' });
  });

  afterEach(() => closeDatabase(db));

  function daysFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  it('should find upcoming reminders within the default 14-day window', () => {
    service.create(userId, { contact_id: contactId, title: 'Call Alice', reminder_date: daysFromNow(5) });
    service.create(userId, { contact_id: contactId2, title: 'Email Bob', reminder_date: daysFromNow(10) });
    // Too far away
    service.create(userId, { contact_id: contactId, title: 'Far Away', reminder_date: daysFromNow(30) });

    const result = service.getUpcomingReminders(userId);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('Call Alice');
    expect(result.data[1].title).toBe('Email Bob');
  });

  it('should include overdue reminders by default', () => {
    service.create(userId, { contact_id: contactId, title: 'Overdue', reminder_date: daysFromNow(-5) });
    service.create(userId, { contact_id: contactId, title: 'Upcoming', reminder_date: daysFromNow(3) });

    const result = service.getUpcomingReminders(userId);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].title).toBe('Overdue');
    expect(result.data[0].is_overdue).toBe(true);
    expect(result.data[0].days_until).toBeLessThan(0);
    expect(result.data[1].title).toBe('Upcoming');
    expect(result.data[1].is_overdue).toBe(false);
  });

  it('should exclude overdue reminders when include_overdue is false', () => {
    service.create(userId, { contact_id: contactId, title: 'Overdue', reminder_date: daysFromNow(-5) });
    service.create(userId, { contact_id: contactId, title: 'Upcoming', reminder_date: daysFromNow(3) });

    const result = service.getUpcomingReminders(userId, { include_overdue: false });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Upcoming');
  });

  it('should filter by snoozed status', () => {
    const r1 = service.create(userId, { contact_id: contactId, title: 'Active', reminder_date: daysFromNow(3) });
    const r2 = service.create(userId, { contact_id: contactId, title: 'Snoozed', reminder_date: daysFromNow(5) });
    service.snooze(userId, r2.id, daysFromNow(5));

    const activeResult = service.getUpcomingReminders(userId, { status: 'active' });
    expect(activeResult.data).toHaveLength(1);
    expect(activeResult.data[0].title).toBe('Active');

    const snoozedResult = service.getUpcomingReminders(userId, { status: 'snoozed' });
    expect(snoozedResult.data).toHaveLength(1);
    expect(snoozedResult.data[0].title).toBe('Snoozed');
  });

  it('should include contact name from cross-contact join', () => {
    service.create(userId, { contact_id: contactId, title: 'R1', reminder_date: daysFromNow(3) });
    service.create(userId, { contact_id: contactId2, title: 'R2', reminder_date: daysFromNow(5) });

    const result = service.getUpcomingReminders(userId);
    expect(result.data[0].contact_name).toBe('Alice Smith');
    expect(result.data[1].contact_name).toBe('Bob Jones');
  });

  it('should exclude soft-deleted reminders', () => {
    const r = service.create(userId, { contact_id: contactId, title: 'Deleted', reminder_date: daysFromNow(3) });
    service.softDelete(userId, r.id);

    const result = service.getUpcomingReminders(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should exclude reminders for soft-deleted contacts', () => {
    service.create(userId, { contact_id: contactId, title: 'R1', reminder_date: daysFromNow(3) });
    // Soft-delete the contact
    db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(contactId);

    const result = service.getUpcomingReminders(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should use custom days_ahead', () => {
    service.create(userId, { contact_id: contactId, title: 'InRange', reminder_date: daysFromNow(20) });

    const narrow = service.getUpcomingReminders(userId, { days_ahead: 10 });
    expect(narrow.data).toHaveLength(0);

    const wide = service.getUpcomingReminders(userId, { days_ahead: 25 });
    expect(wide.data).toHaveLength(1);
  });

  it('should compute correct days_until', () => {
    service.create(userId, { contact_id: contactId, title: 'Today', reminder_date: daysFromNow(0) });
    service.create(userId, { contact_id: contactId, title: 'Tomorrow', reminder_date: daysFromNow(1) });

    const result = service.getUpcomingReminders(userId);
    const today = result.data.find(d => d.title === 'Today');
    const tomorrow = result.data.find(d => d.title === 'Tomorrow');
    expect(today?.days_until).toBe(0);
    expect(tomorrow?.days_until).toBe(1);
  });

  it('should only return reminders for the given user', () => {
    const otherUserId = createTestUser(db, { email: 'other@test.com' });
    const otherContact = createTestContact(db, otherUserId, { firstName: 'Other' });
    service.create(otherUserId, { contact_id: otherContact, title: 'Other R', reminder_date: daysFromNow(3) });
    service.create(userId, { contact_id: contactId, title: 'My R', reminder_date: daysFromNow(3) });

    const result = service.getUpcomingReminders(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('My R');
  });
});
