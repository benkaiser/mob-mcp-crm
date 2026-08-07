import { describe, it, expect, afterEach } from 'vitest';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { importMonicaExport } from '../../src/services/monica-import.js';
import { ReminderService } from '../../src/services/reminders.js';
import { ContactService } from '../../src/services/contacts.js';

describe('importMonicaExport - birthday reminder skipping', () => {
  let db: ReturnType<typeof createTestDatabase>;

  afterEach(() => db?.close());

  function buildDump(): string {
    return [
      'INSERT IGNORE INTO `contacts` (`id`, `first_name`, `last_name`, `is_partial`, `is_active`, `is_dead`, `is_starred`) VALUES',
      "(1, 'James', 'Smith', 0, 1, 0, 0);",
      '',
      'INSERT IGNORE INTO `reminders` (`id`, `contact_id`, `initial_date`, `title`, `description`, `frequency_type`, `frequency_number`, `delible`) VALUES',
      "(10, 1, '2026-01-08', 'Wish happy birthday to James', NULL, 'year', 1, 0),",
      "(11, 1, '2026-03-15', 'Follow up on job application', 'Check in about the role', 'one_time', 1, 1);",
      '',
    ].join('\n');
  }

  it('skips Monica auto-generated (delible=0) birthday reminders and imports user reminders', () => {
    db = createTestDatabase();
    const userId = createTestUser(db);

    const result = importMonicaExport(db, userId, buildDump());

    expect(result.reminders).toBe(1);
    expect(result.skipped_birthday_reminders).toBe(1);

    const reminders = new ReminderService(db).list(userId).data;
    expect(reminders).toHaveLength(1);
    expect(reminders[0].title).toBe('Follow up on job application');
  });

  it('defaults to importing reminders when the delible column is absent', () => {
    db = createTestDatabase();
    const userId = createTestUser(db);

    const dump = [
      'INSERT IGNORE INTO `contacts` (`id`, `first_name`, `last_name`, `is_partial`, `is_active`, `is_dead`, `is_starred`) VALUES',
      "(1, 'James', 'Smith', 0, 1, 0, 0);",
      '',
      'INSERT IGNORE INTO `reminders` (`id`, `contact_id`, `initial_date`, `title`, `description`, `frequency_type`, `frequency_number`) VALUES',
      "(10, 1, '2026-03-15', 'Send a postcard', NULL, 'one_time', 1);",
      '',
    ].join('\n');

    const result = importMonicaExport(db, userId, dump);

    expect(result.reminders).toBe(1);
    expect(result.skipped_birthday_reminders).toBe(0);
  });
});

describe('importMonicaExport - middle name handling', () => {
  let db: ReturnType<typeof createTestDatabase>;

  afterEach(() => db?.close());

  it('folds Monica middle_name into first_name (no separate middle_name field)', () => {
    db = createTestDatabase();
    const userId = createTestUser(db);

    const dump = [
      'INSERT IGNORE INTO `contacts` (`id`, `first_name`, `middle_name`, `last_name`, `is_partial`, `is_active`, `is_dead`, `is_starred`) VALUES',
      "(1, 'John', 'Jeffery', 'Doe', 0, 1, 0, 0);",
      '',
    ].join('\n');

    const result = importMonicaExport(db, userId, dump);

    expect(result.contacts).toBe(1);

    const contacts = new ContactService(db).list(userId).data;
    expect(contacts).toHaveLength(1);
    expect(contacts[0].first_name).toBe('John Jeffery');
    expect(contacts[0].last_name).toBe('Doe');
  });
});
