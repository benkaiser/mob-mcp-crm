import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactService, calculateAge } from '../../src/services/contacts.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('calculateAge', () => {
  it('should calculate age from full date', () => {
    const result = calculateAge({
      birthday_mode: 'full_date',
      birthday_date: '1990-01-15',
      birthday_year_approximate: null,
    });
    expect(result).not.toBeNull();
    expect(result!.approximate).toBe(false);
    expect(result!.age).toBeGreaterThanOrEqual(35);
  });

  it('should calculate approximate age from birth year', () => {
    const result = calculateAge({
      birthday_mode: 'approximate_age',
      birthday_date: null,
      birthday_year_approximate: 1990,
    });
    expect(result).not.toBeNull();
    expect(result!.approximate).toBe(true);
    expect(result!.age).toBeGreaterThanOrEqual(35);
  });

  it('should return null for month_day mode (no year)', () => {
    const result = calculateAge({
      birthday_mode: 'month_day',
      birthday_date: null,
      birthday_year_approximate: null,
    });
    expect(result).toBeNull();
  });

  it('should return null when no birthday mode set', () => {
    const result = calculateAge({
      birthday_mode: null,
      birthday_date: null,
      birthday_year_approximate: null,
    });
    expect(result).toBeNull();
  });
});

describe('ContactService', () => {
  let db: Database.Database;
  let service: ContactService;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ContactService(db);
    userId = createTestUser(db);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe('create', () => {
    it('should create a contact with minimal fields', () => {
      const contact = service.create(userId, { first_name: 'Alice' });

      expect(contact.id).toBeDefined();
      expect(contact.first_name).toBe('Alice');
      expect(contact.last_name).toBeNull();
      expect(contact.status).toBe('active');
      expect(contact.is_favorite).toBe(false);
      expect(contact.created_at).toBeDefined();
    });

    it('should create a contact with all fields', () => {
      const contact = service.create(userId, {
        first_name: 'Alice',
        last_name: 'Smith',
        nickname: 'Ali',
        maiden_name: 'Johnson',
        gender: 'Female',
        pronouns: 'she/her',
        birthday_mode: 'full_date',
        birthday_date: '1990-03-15',
        status: 'active',
        is_favorite: true,
        met_at_date: '2020-01-01',
        met_at_location: 'Conference',
        met_description: 'Met at a tech conference',
        job_title: 'Engineer',
        company: 'Acme Corp',
        industry: 'Technology',
        work_notes: 'Works on backend systems',
      });

      expect(contact.first_name).toBe('Alice');
      expect(contact.last_name).toBe('Smith');
      expect(contact.nickname).toBe('Ali');
      expect(contact.maiden_name).toBe('Johnson');
      expect(contact.gender).toBe('Female');
      expect(contact.pronouns).toBe('she/her');
      expect(contact.birthday_mode).toBe('full_date');
      expect(contact.birthday_date).toBe('1990-03-15');
      expect(contact.is_favorite).toBe(true);
      expect(contact.company).toBe('Acme Corp');
      expect(contact.age).toBeGreaterThanOrEqual(35);
      expect(contact.age_approximate).toBe(false);
    });

    it('should create a contact with month_day birthday', () => {
      const contact = service.create(userId, {
        first_name: 'Bob',
        birthday_mode: 'month_day',
        birthday_month: 3,
        birthday_day: 15,
      });

      expect(contact.birthday_mode).toBe('month_day');
      expect(contact.birthday_month).toBe(3);
      expect(contact.birthday_day).toBe(15);
      expect(contact.age).toBeUndefined();
    });

    it('should create a contact with approximate age birthday', () => {
      const contact = service.create(userId, {
        first_name: 'Charlie',
        birthday_mode: 'approximate_age',
        birthday_year_approximate: 1985,
      });

      expect(contact.birthday_mode).toBe('approximate_age');
      expect(contact.birthday_year_approximate).toBe(1985);
      expect(contact.age).toBeGreaterThanOrEqual(40);
      expect(contact.age_approximate).toBe(true);
    });
  });

  describe('get', () => {
    it('should get a contact by ID', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const fetched = service.get(userId, created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.first_name).toBe('Alice');
    });

    it('should return null for non-existent contact', () => {
      const result = service.get(userId, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should return null for deleted contact', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      service.softDelete(userId, created.id);

      const result = service.get(userId, created.id);
      expect(result).toBeNull();
    });

    it('should not return contacts belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const created = service.create(userId, { first_name: 'Alice' });

      const result = service.get(otherUserId, created.id);
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update contact fields', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, {
        last_name: 'Smith',
        company: 'Acme Corp',
        is_favorite: true,
      });

      expect(updated).not.toBeNull();
      expect(updated!.last_name).toBe('Smith');
      expect(updated!.company).toBe('Acme Corp');
      expect(updated!.is_favorite).toBe(true);
      expect(updated!.first_name).toBe('Alice'); // unchanged
    });

    it('should update status to archived', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, { status: 'archived' });

      expect(updated!.status).toBe('archived');
    });

    it('should update status to deceased with date', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, {
        status: 'deceased',
        deceased_date: '2024-06-15',
      });

      expect(updated!.status).toBe('deceased');
      expect(updated!.deceased_date).toBe('2024-06-15');
    });

    it('should return null for non-existent contact', () => {
      const result = service.update(userId, 'nonexistent', { first_name: 'Bob' });
      expect(result).toBeNull();
    });

    it('should update the updated_at timestamp', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const updated = service.update(userId, created.id, { last_name: 'Smith' });

      // updated_at should be set (we can't guarantee different from created_at due to speed)
      expect(updated!.updated_at).toBeDefined();
      expect(typeof updated!.updated_at).toBe('string');
    });
  });

  describe('softDelete', () => {
    it('should soft-delete a contact', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      const result = service.softDelete(userId, created.id);

      expect(result).toBe(true);

      // Should not be findable anymore
      const fetched = service.get(userId, created.id);
      expect(fetched).toBeNull();
    });

    it('should return false for non-existent contact', () => {
      const result = service.softDelete(userId, 'nonexistent');
      expect(result).toBe(false);
    });

    it('should return false for already deleted contact', () => {
      const created = service.create(userId, { first_name: 'Alice' });
      service.softDelete(userId, created.id);

      const result = service.softDelete(userId, created.id);
      expect(result).toBe(false);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      service.create(userId, { first_name: 'Alice', last_name: 'Anderson', company: 'Acme' });
      service.create(userId, { first_name: 'Bob', last_name: 'Brown', company: 'Beta Inc', is_favorite: true });
      service.create(userId, { first_name: 'Charlie', last_name: 'Chen', status: 'archived' });
      service.create(userId, { first_name: 'Diana', last_name: 'Davis', company: 'Acme' });
    });

    it('should list all non-deleted contacts by default', () => {
      const result = service.list(userId);

      expect(result.total).toBe(4); // includes archived Charlie, excludes none
      expect(result.data).toHaveLength(4);
      expect(result.page).toBe(1);
      expect(result.per_page).toBe(20);
    });

    it('should filter by status', () => {
      const result = service.list(userId, { status: 'archived' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Charlie');
    });

    it('should filter to only active contacts', () => {
      const result = service.list(userId, { status: 'active' });
      expect(result.total).toBe(3);
      expect(result.data.every((c) => c.status === 'active')).toBe(true);
    });

    it('should filter by favorite', () => {
      const result = service.list(userId, { is_favorite: true });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Bob');
    });

    it('should filter by company', () => {
      const result = service.list(userId, { company: 'Acme' });
      expect(result.total).toBe(2);
    });

    it('should search by name', () => {
      const result = service.list(userId, { search: 'alice' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Alice');
    });

    it('should search by full name across first and last name fields', () => {
      const result = service.list(userId, { search: 'Alice Anderson' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Alice');
      expect(result.data[0].last_name).toBe('Anderson');
    });

    it('should search by company', () => {
      const result = service.list(userId, { search: 'Beta' });
      expect(result.total).toBe(1);
      expect(result.data[0].first_name).toBe('Bob');
    });

    it('should paginate results', () => {
      const page1 = service.list(userId, { per_page: 2, page: 1 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(4);

      const page2 = service.list(userId, { per_page: 2, page: 2 });
      expect(page2.data).toHaveLength(2);
    });

    it('should sort by name ascending by default', () => {
      const result = service.list(userId);
      const names = result.data.map((c) => c.last_name);
      expect(names).toEqual(['Anderson', 'Brown', 'Chen', 'Davis']);
    });

    it('should sort by name descending', () => {
      const result = service.list(userId, { sort_by: 'name', sort_order: 'desc' });
      const names = result.data.map((c) => c.last_name);
      expect(names).toEqual(['Davis', 'Chen', 'Brown', 'Anderson']);
    });

    it('should not include soft-deleted contacts', () => {
      const all = service.list(userId);
      const alice = all.data.find((c) => c.first_name === 'Alice')!;
      service.softDelete(userId, alice.id);

      const afterDelete = service.list(userId);
      expect(afterDelete.total).toBe(3);
    });

    it('should not include contacts from other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      service.create(otherUserId, { first_name: 'OtherUser' });

      const result = service.list(userId);
      expect(result.data.every((c) => c.first_name !== 'OtherUser')).toBe(true);
    });
  });
});
