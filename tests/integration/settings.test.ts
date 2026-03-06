import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { UserSettingsService } from '../../src/services/settings.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('UserSettingsService', () => {
  let db: Database.Database;
  let service: UserSettingsService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new UserSettingsService(db);
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  it('should auto-create default settings on get', () => {
    const settings = service.get(userId);
    expect(settings.user_id).toBe(userId);
    expect(settings.timezone).toBe('UTC');
    expect(settings.birthday_reminder_time).toBe('09:00');
    expect(settings.birthday_reminder_offsets).toEqual([0, 7, 30]);
  });

  it('should return existing settings without duplicating', () => {
    service.get(userId);
    const settings = service.get(userId);
    expect(settings.timezone).toBe('UTC');
  });

  it('should update timezone', () => {
    const settings = service.update(userId, { timezone: 'America/New_York' });
    expect(settings.timezone).toBe('America/New_York');
  });

  it('should update birthday_reminder_time', () => {
    const settings = service.update(userId, { birthday_reminder_time: '08:30' });
    expect(settings.birthday_reminder_time).toBe('08:30');
  });

  it('should update birthday_reminder_offsets', () => {
    const settings = service.update(userId, { birthday_reminder_offsets: [0, 1, 3] });
    expect(settings.birthday_reminder_offsets).toEqual([0, 1, 3]);
  });

  it('should reject invalid timezone', () => {
    expect(() => service.update(userId, { timezone: 'Invalid/Zone' })).toThrow('Invalid timezone');
  });

  it('should reject invalid time format', () => {
    expect(() => service.update(userId, { birthday_reminder_time: '25:00' })).toThrow('Invalid time format');
    expect(() => service.update(userId, { birthday_reminder_time: '9am' })).toThrow('Invalid time format');
  });

  it('should reject invalid offsets', () => {
    expect(() => service.update(userId, { birthday_reminder_offsets: [] })).toThrow('non-empty array');
    expect(() => service.update(userId, { birthday_reminder_offsets: [-1] })).toThrow('non-negative');
  });

  it('should create defaults with timezone', () => {
    const user2 = createTestUser(db, { email: 'user2@test.com' });
    service.createDefaults(user2, 'Europe/London');
    const settings = service.get(user2);
    expect(settings.timezone).toBe('Europe/London');
  });

  it('should create defaults with invalid timezone falling back to UTC', () => {
    const user2 = createTestUser(db, { email: 'user3@test.com' });
    service.createDefaults(user2, 'Not/Real');
    const settings = service.get(user2);
    expect(settings.timezone).toBe('UTC');
  });

  it('should update multiple fields at once', () => {
    const settings = service.update(userId, {
      timezone: 'Asia/Tokyo',
      birthday_reminder_time: '10:00',
      birthday_reminder_offsets: [0, 14],
    });
    expect(settings.timezone).toBe('Asia/Tokyo');
    expect(settings.birthday_reminder_time).toBe('10:00');
    expect(settings.birthday_reminder_offsets).toEqual([0, 14]);
  });
});
