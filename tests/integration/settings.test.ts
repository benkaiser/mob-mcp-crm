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

  it('should default reminder_offsets to [0, 7, 30]', () => {
    const settings = service.get(userId);
    expect(settings.reminder_offsets).toEqual([0, 7, 30]);
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

  it('should update reminder_offsets independently of birthday offsets', () => {
    const settings = service.update(userId, { reminder_offsets: [0, 2, 5] });
    expect(settings.reminder_offsets).toEqual([0, 2, 5]);
    // Birthday offsets remain at their default
    expect(settings.birthday_reminder_offsets).toEqual([0, 7, 30]);
  });

  it('should reject invalid reminder_offsets', () => {
    expect(() => service.update(userId, { reminder_offsets: [] })).toThrow('non-empty array');
    expect(() => service.update(userId, { reminder_offsets: [-1] })).toThrow('non-negative');
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

  // ─── Matrix notification target ───────────────────────────────

  it('should default the Matrix fields to null', () => {
    const settings = service.get(userId);
    expect(settings.matrix_homeserver).toBeNull();
    expect(settings.matrix_access_token).toBeNull();
    expect(settings.matrix_room_id).toBeNull();
  });

  it('should round-trip Matrix connection details', () => {
    const settings = service.update(userId, {
      matrix_homeserver: 'https://matrix.example.org',
      matrix_access_token: 'syt_token',
      matrix_room_id: '!room:example.org',
    });
    expect(settings.matrix_homeserver).toBe('https://matrix.example.org');
    expect(settings.matrix_access_token).toBe('syt_token');
    expect(settings.matrix_room_id).toBe('!room:example.org');
    // Persisted
    expect(service.get(userId).matrix_room_id).toBe('!room:example.org');
  });

  it('should reject a non-URL Matrix homeserver', () => {
    expect(() => service.update(userId, { matrix_homeserver: 'not a url' })).toThrow(/homeserver/i);
  });

  it('should reject a non-https/http Matrix homeserver scheme', () => {
    expect(() => service.update(userId, { matrix_homeserver: 'ftp://matrix.example.org' })).toThrow(/homeserver/i);
  });

  it('should clear Matrix fields when given empty strings', () => {
    service.update(userId, {
      matrix_homeserver: 'https://matrix.example.org',
      matrix_access_token: 'syt_token',
      matrix_room_id: '!room:example.org',
    });
    const cleared = service.update(userId, {
      matrix_homeserver: '',
      matrix_access_token: '',
      matrix_room_id: '',
    });
    expect(cleared.matrix_homeserver).toBeNull();
    expect(cleared.matrix_access_token).toBeNull();
    expect(cleared.matrix_room_id).toBeNull();
  });
});
