import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactMethodService } from '../../src/services/contact-methods.js';
import { AddressService } from '../../src/services/addresses.js';
import { FoodPreferencesService } from '../../src/services/food-preferences.js';
import { CustomFieldService } from '../../src/services/custom-fields.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ContactMethodService', () => {
  let db: Database.Database;
  let service: ContactMethodService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ContactMethodService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId);
  });

  afterEach(() => closeDatabase(db));

  it('should add a contact method', () => {
    const method = service.add({ contact_id: contactId, type: 'email', value: 'alice@example.com' });
    expect(method.type).toBe('email');
    expect(method.value).toBe('alice@example.com');
    expect(method.is_primary).toBe(false);
  });

  it('should add multiple methods of the same type', () => {
    service.add({ contact_id: contactId, type: 'email', value: 'personal@example.com', label: 'Personal' });
    service.add({ contact_id: contactId, type: 'email', value: 'work@example.com', label: 'Work' });

    const methods = service.listByContact(contactId);
    expect(methods.filter((m) => m.type === 'email')).toHaveLength(2);
  });

  it('should handle primary flag', () => {
    const m1 = service.add({ contact_id: contactId, type: 'email', value: 'first@example.com', is_primary: true });
    expect(m1.is_primary).toBe(true);

    const m2 = service.add({ contact_id: contactId, type: 'email', value: 'second@example.com', is_primary: true });
    expect(m2.is_primary).toBe(true);

    // First one should no longer be primary
    const methods = service.listByContact(contactId);
    const first = methods.find((m) => m.id === m1.id);
    expect(first!.is_primary).toBe(false);
  });

  it('should update a contact method', () => {
    const method = service.add({ contact_id: contactId, type: 'phone', value: '555-1234' });
    const updated = service.update(method.id, { value: '555-5678', label: 'Mobile' });

    expect(updated!.value).toBe('555-5678');
    expect(updated!.label).toBe('Mobile');
  });

  it('should remove a contact method', () => {
    const method = service.add({ contact_id: contactId, type: 'email', value: 'test@example.com' });
    const result = service.remove(method.id);
    expect(result).toBe(true);

    const methods = service.listByContact(contactId);
    expect(methods).toHaveLength(0);
  });

  it('should return false for removing non-existent method', () => {
    const result = service.remove('nonexistent');
    expect(result).toBe(false);
  });

  it('should list methods sorted by primary first', () => {
    service.add({ contact_id: contactId, type: 'email', value: 'secondary@example.com' });
    service.add({ contact_id: contactId, type: 'email', value: 'primary@example.com', is_primary: true });

    const methods = service.listByContact(contactId);
    expect(methods[0].is_primary).toBe(true);
    expect(methods[0].value).toBe('primary@example.com');
  });
});

describe('AddressService', () => {
  let db: Database.Database;
  let service: AddressService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new AddressService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId);
  });

  afterEach(() => closeDatabase(db));

  it('should add an address with all fields', () => {
    const address = service.add({
      contact_id: contactId,
      label: 'Home',
      street_line_1: '123 Main St',
      street_line_2: 'Apt 4',
      city: 'Springfield',
      state_province: 'IL',
      postal_code: '62701',
      country: 'US',
      is_primary: true,
    });

    expect(address.label).toBe('Home');
    expect(address.city).toBe('Springfield');
    expect(address.is_primary).toBe(true);
  });

  it('should add a partial address (just city and country)', () => {
    const address = service.add({
      contact_id: contactId,
      city: 'Berlin',
      country: 'DE',
    });

    expect(address.city).toBe('Berlin');
    expect(address.country).toBe('DE');
    expect(address.street_line_1).toBeNull();
  });

  it('should handle primary flag', () => {
    const a1 = service.add({ contact_id: contactId, label: 'Home', is_primary: true });
    const a2 = service.add({ contact_id: contactId, label: 'Work', is_primary: true });

    const addresses = service.listByContact(contactId);
    const home = addresses.find((a) => a.id === a1.id);
    const work = addresses.find((a) => a.id === a2.id);
    expect(home!.is_primary).toBe(false);
    expect(work!.is_primary).toBe(true);
  });

  it('should update an address', () => {
    const address = service.add({ contact_id: contactId, city: 'Springfield' });
    const updated = service.update(address.id, { city: 'Shelbyville', state_province: 'IL' });

    expect(updated!.city).toBe('Shelbyville');
    expect(updated!.state_province).toBe('IL');
  });

  it('should remove an address', () => {
    const address = service.add({ contact_id: contactId, city: 'Springfield' });
    expect(service.remove(address.id)).toBe(true);
    expect(service.listByContact(contactId)).toHaveLength(0);
  });
});

describe('FoodPreferencesService', () => {
  let db: Database.Database;
  let service: FoodPreferencesService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new FoodPreferencesService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId);
  });

  afterEach(() => closeDatabase(db));

  it('should return null when no preferences exist', () => {
    const result = service.get(contactId);
    expect(result).toBeNull();
  });

  it('should create food preferences', () => {
    const prefs = service.upsert({
      contact_id: contactId,
      dietary_restrictions: ['vegetarian'],
      allergies: ['peanuts'],
      favorite_foods: ['pasta', 'sushi'],
      disliked_foods: ['liver'],
      notes: 'Loves spicy food',
    });

    expect(prefs.dietary_restrictions).toEqual(['vegetarian']);
    expect(prefs.allergies).toEqual(['peanuts']);
    expect(prefs.favorite_foods).toEqual(['pasta', 'sushi']);
    expect(prefs.disliked_foods).toEqual(['liver']);
    expect(prefs.notes).toBe('Loves spicy food');
  });

  it('should update existing food preferences (upsert)', () => {
    service.upsert({
      contact_id: contactId,
      dietary_restrictions: ['vegetarian'],
      allergies: ['peanuts'],
    });

    const updated = service.upsert({
      contact_id: contactId,
      dietary_restrictions: ['vegan'],
      allergies: ['peanuts', 'shellfish'],
      favorite_foods: ['salad'],
    });

    expect(updated.dietary_restrictions).toEqual(['vegan']);
    expect(updated.allergies).toEqual(['peanuts', 'shellfish']);
    expect(updated.favorite_foods).toEqual(['salad']);
  });

  it('should handle empty arrays', () => {
    const prefs = service.upsert({ contact_id: contactId });

    expect(prefs.dietary_restrictions).toEqual([]);
    expect(prefs.allergies).toEqual([]);
    expect(prefs.favorite_foods).toEqual([]);
    expect(prefs.disliked_foods).toEqual([]);
  });
});

describe('CustomFieldService', () => {
  let db: Database.Database;
  let service: CustomFieldService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new CustomFieldService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId);
  });

  afterEach(() => closeDatabase(db));

  it('should add a custom field', () => {
    const field = service.add({
      contact_id: contactId,
      field_name: 'Favorite Color',
      field_value: 'Blue',
      field_group: 'Preferences',
    });

    expect(field.field_name).toBe('Favorite Color');
    expect(field.field_value).toBe('Blue');
    expect(field.field_group).toBe('Preferences');
  });

  it('should add a field without a group', () => {
    const field = service.add({
      contact_id: contactId,
      field_name: 'T-shirt Size',
      field_value: 'M',
    });

    expect(field.field_group).toBeNull();
  });

  it('should update a custom field', () => {
    const field = service.add({
      contact_id: contactId,
      field_name: 'Favorite Color',
      field_value: 'Blue',
    });

    const updated = service.update(field.id, { field_value: 'Green' });
    expect(updated!.field_value).toBe('Green');
    expect(updated!.field_name).toBe('Favorite Color'); // unchanged
  });

  it('should remove a custom field', () => {
    const field = service.add({
      contact_id: contactId,
      field_name: 'Test',
      field_value: 'Value',
    });

    expect(service.remove(field.id)).toBe(true);
    expect(service.listByContact(contactId)).toHaveLength(0);
  });

  it('should list fields sorted by group then name', () => {
    service.add({ contact_id: contactId, field_name: 'Zebra', field_value: 'Z', field_group: 'B' });
    service.add({ contact_id: contactId, field_name: 'Apple', field_value: 'A', field_group: 'A' });
    service.add({ contact_id: contactId, field_name: 'Banana', field_value: 'B', field_group: 'A' });

    const fields = service.listByContact(contactId);
    expect(fields.map((f) => f.field_name)).toEqual(['Apple', 'Banana', 'Zebra']);
  });

  it('should return null when updating non-existent field', () => {
    const result = service.update('nonexistent', { field_value: 'test' });
    expect(result).toBeNull();
  });
});
