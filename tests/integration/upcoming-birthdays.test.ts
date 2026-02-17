import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactService } from '../../src/services/contacts.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ContactService.getUpcomingBirthdays', () => {
  let db: Database.Database;
  let service: ContactService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ContactService(db);
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  function createContactWithBirthday(opts: {
    firstName: string;
    lastName?: string;
    birthdayMode: 'full_date' | 'month_day' | 'approximate_age';
    birthdayDate?: string;
    birthdayMonth: number;
    birthdayDay: number;
    birthdayYearApprox?: number;
    status?: string;
  }): string {
    return service.create(userId, {
      first_name: opts.firstName,
      last_name: opts.lastName,
      birthday_mode: opts.birthdayMode,
      birthday_date: opts.birthdayDate,
      birthday_month: opts.birthdayMonth,
      birthday_day: opts.birthdayDay,
      birthday_year_approximate: opts.birthdayYearApprox,
      status: opts.status as any,
    }).id;
  }

  it('should find birthdays within the default 30-day window', () => {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 10);

    createContactWithBirthday({
      firstName: 'Alice',
      birthdayMode: 'full_date',
      birthdayDate: `1990-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`,
      birthdayMonth: futureDate.getMonth() + 1,
      birthdayDay: futureDate.getDate(),
    });

    // Birthday 100 days ahead — should NOT appear
    const farDate = new Date(now);
    farDate.setDate(farDate.getDate() + 100);
    createContactWithBirthday({
      firstName: 'Bob',
      birthdayMode: 'full_date',
      birthdayDate: `1985-${String(farDate.getMonth() + 1).padStart(2, '0')}-${String(farDate.getDate()).padStart(2, '0')}`,
      birthdayMonth: farDate.getMonth() + 1,
      birthdayDay: farDate.getDate(),
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Alice');
    expect(result.data[0].days_until).toBeLessThanOrEqual(30);
  });

  it('should handle today as a birthday', () => {
    const now = new Date();

    createContactWithBirthday({
      firstName: 'Birthday',
      lastName: 'Person',
      birthdayMode: 'full_date',
      birthdayDate: `1990-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      birthdayMonth: now.getMonth() + 1,
      birthdayDay: now.getDate(),
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].is_today).toBe(true);
    expect(result.data[0].days_until).toBe(0);
    expect(result.data[0].contact_name).toBe('Birthday Person');
  });

  it('should calculate age_turning for full_date mode', () => {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 5);

    createContactWithBirthday({
      firstName: 'Alice',
      birthdayMode: 'full_date',
      birthdayDate: `1990-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`,
      birthdayMonth: futureDate.getMonth() + 1,
      birthdayDay: futureDate.getDate(),
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data[0].age_turning).toBe(futureDate.getFullYear() - 1990);
  });

  it('should return null age_turning for month_day mode', () => {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 5);

    createContactWithBirthday({
      firstName: 'Bob',
      birthdayMode: 'month_day',
      birthdayMonth: futureDate.getMonth() + 1,
      birthdayDay: futureDate.getDate(),
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data[0].age_turning).toBeNull();
  });

  it('should filter by specific month', () => {
    // Create a contact with birthday in March
    createContactWithBirthday({
      firstName: 'March',
      birthdayMode: 'month_day',
      birthdayMonth: 3,
      birthdayDay: 15,
    });

    // Create a contact with birthday in June
    createContactWithBirthday({
      firstName: 'June',
      birthdayMode: 'month_day',
      birthdayMonth: 6,
      birthdayDay: 20,
    });

    const result = service.getUpcomingBirthdays(userId, { month: 3 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('March');
  });

  it('should exclude deceased contacts', () => {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 5);

    createContactWithBirthday({
      firstName: 'Alive',
      birthdayMode: 'month_day',
      birthdayMonth: futureDate.getMonth() + 1,
      birthdayDay: futureDate.getDate(),
    });

    createContactWithBirthday({
      firstName: 'Deceased',
      birthdayMode: 'month_day',
      birthdayMonth: futureDate.getMonth() + 1,
      birthdayDay: futureDate.getDate(),
      status: 'deceased',
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Alive');
  });

  it('should exclude soft-deleted contacts', () => {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 5);

    const contactId = createContactWithBirthday({
      firstName: 'Deleted',
      birthdayMode: 'month_day',
      birthdayMonth: futureDate.getMonth() + 1,
      birthdayDay: futureDate.getDate(),
    });

    service.softDelete(userId, contactId);

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should handle all three birthday modes', () => {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 5);
    const m = futureDate.getMonth() + 1;
    const d = futureDate.getDate();

    createContactWithBirthday({
      firstName: 'FullDate',
      birthdayMode: 'full_date',
      birthdayDate: `1990-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      birthdayMonth: m,
      birthdayDay: d,
    });

    createContactWithBirthday({
      firstName: 'MonthDay',
      birthdayMode: 'month_day',
      birthdayMonth: m,
      birthdayDay: d,
    });

    createContactWithBirthday({
      firstName: 'Approx',
      birthdayMode: 'approximate_age',
      birthdayMonth: m,
      birthdayDay: d,
      birthdayYearApprox: 1988,
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);

    const fullDate = result.data.find(d => d.contact_name === 'FullDate');
    expect(fullDate?.birthday_mode).toBe('full_date');
    expect(fullDate?.age_turning).toBeTruthy();

    const monthDay = result.data.find(d => d.contact_name === 'MonthDay');
    expect(monthDay?.birthday_mode).toBe('month_day');
    expect(monthDay?.age_turning).toBeNull();

    const approx = result.data.find(d => d.contact_name === 'Approx');
    expect(approx?.birthday_mode).toBe('approximate_age');
    expect(approx?.age_turning).toBeTruthy();
  });

  it('should sort by soonest birthday first', () => {
    const now = new Date();
    const in5 = new Date(now);
    in5.setDate(in5.getDate() + 5);
    const in15 = new Date(now);
    in15.setDate(in15.getDate() + 15);
    const in2 = new Date(now);
    in2.setDate(in2.getDate() + 2);

    createContactWithBirthday({
      firstName: 'Five',
      birthdayMode: 'month_day',
      birthdayMonth: in5.getMonth() + 1,
      birthdayDay: in5.getDate(),
    });
    createContactWithBirthday({
      firstName: 'Fifteen',
      birthdayMode: 'month_day',
      birthdayMonth: in15.getMonth() + 1,
      birthdayDay: in15.getDate(),
    });
    createContactWithBirthday({
      firstName: 'Two',
      birthdayMode: 'month_day',
      birthdayMonth: in2.getMonth() + 1,
      birthdayDay: in2.getDate(),
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data[0].contact_name).toBe('Two');
    expect(result.data[1].contact_name).toBe('Five');
    expect(result.data[2].contact_name).toBe('Fifteen');
  });

  it('should handle year boundary (Dec → Jan)', () => {
    // Create a birthday on Jan 5, and run the test to see if it's found
    // when days_ahead is large enough
    createContactWithBirthday({
      firstName: 'January',
      birthdayMode: 'month_day',
      birthdayMonth: 1,
      birthdayDay: 5,
    });

    // With a 365-day window, it should always be found
    const result = service.getUpcomingBirthdays(userId, { days_ahead: 365 });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    const jan = result.data.find(d => d.contact_name === 'January');
    expect(jan).toBeDefined();
    expect(jan!.days_until).toBeGreaterThanOrEqual(0);
    expect(jan!.days_until).toBeLessThanOrEqual(365);
  });

  it('should use custom days_ahead', () => {
    const now = new Date();
    const in10 = new Date(now);
    in10.setDate(in10.getDate() + 10);

    createContactWithBirthday({
      firstName: 'InRange',
      birthdayMode: 'month_day',
      birthdayMonth: in10.getMonth() + 1,
      birthdayDay: in10.getDate(),
    });

    const narrow = service.getUpcomingBirthdays(userId, { days_ahead: 5 });
    expect(narrow.data).toHaveLength(0);

    const wide = service.getUpcomingBirthdays(userId, { days_ahead: 15 });
    expect(wide.data).toHaveLength(1);
  });

  it('should skip contacts without birthday info', () => {
    // Contact with no birthday
    service.create(userId, { first_name: 'NoBirthday' });

    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 5);

    createContactWithBirthday({
      firstName: 'HasBirthday',
      birthdayMode: 'month_day',
      birthdayMonth: futureDate.getMonth() + 1,
      birthdayDay: futureDate.getDate(),
    });

    const result = service.getUpcomingBirthdays(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('HasBirthday');
  });
});
