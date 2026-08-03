import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  RelationshipService,
  CustomRelationshipTypeService,
  getInverseType,
  getInverseTypeForUser,
  getRelationshipTypeOptionsForUser,
  getRelationshipTypes,
  slugify,
} from '../../src/services/relationships.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('getInverseType', () => {
  it('should return correct inverse for asymmetric types', () => {
    expect(getInverseType('parent')).toBe('child');
    expect(getInverseType('child')).toBe('parent');
    expect(getInverseType('boss')).toBe('subordinate');
    expect(getInverseType('subordinate')).toBe('boss');
    expect(getInverseType('grandparent')).toBe('grandchild');
    expect(getInverseType('mentor')).toBe('protege');
  });

  it('should return same type for symmetric relationships', () => {
    expect(getInverseType('spouse')).toBe('spouse');
    expect(getInverseType('sibling')).toBe('sibling');
    expect(getInverseType('friend')).toBe('friend');
    expect(getInverseType('colleague')).toBe('colleague');
  });

  it('should return same type for unknown/custom types', () => {
    expect(getInverseType('custom_type')).toBe('custom_type');
  });
});

describe('slugify', () => {
  it('normalizes relationship labels to snake_case identifiers', () => {
    expect(slugify('External Mentor!')).toBe('external_mentor');
    expect(slugify('  Coach---Advisor  ')).toBe('coach_advisor');
    expect(slugify('Family & Friends')).toBe('family_friends');
    expect(slugify('!!!')).toBe('');
  });
});

describe('getRelationshipTypes', () => {
  it('should return all known relationship types', () => {
    const types = getRelationshipTypes();
    expect(types).toContain('parent');
    expect(types).toContain('spouse');
    expect(types).toContain('friend');
    expect(types).toContain('colleague');
    expect(types.length).toBeGreaterThan(20);
  });
});

describe('RelationshipService', () => {
  let db: Database.Database;
  let service: RelationshipService;
  let userId: string;
  let contactA: string;
  let contactB: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new RelationshipService(db);
    userId = createTestUser(db);
    contactA = createTestContact(db, userId, { firstName: 'Alice' });
    contactB = createTestContact(db, userId, { firstName: 'Bob' });
  });

  afterEach(() => closeDatabase(db));

  it('should create a relationship and its inverse', () => {
    const rel = service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'parent',
      notes: 'Alice is Bob\'s parent',
    });

    expect(rel.contact_id).toBe(contactA);
    expect(rel.related_contact_id).toBe(contactB);
    expect(rel.relationship_type).toBe('parent');

    // Check inverse was created
    const inverseRels = service.listByContact(contactB);
    expect(inverseRels).toHaveLength(1);
    expect(inverseRels[0].relationship_type).toBe('child');
    expect(inverseRels[0].contact_id).toBe(contactB);
    expect(inverseRels[0].related_contact_id).toBe(contactA);
  });

  it('should create symmetric relationships', () => {
    service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'friend',
    });

    const aRels = service.listByContact(contactA);
    const bRels = service.listByContact(contactB);

    expect(aRels).toHaveLength(1);
    expect(bRels).toHaveLength(1);
    expect(aRels[0].relationship_type).toBe('friend');
    expect(bRels[0].relationship_type).toBe('friend');
  });

  it('should update a relationship and its inverse', () => {
    const rel = service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'friend',
    });

    service.update(rel.id, { relationship_type: 'best_friend', notes: 'BFFs' });

    const aRels = service.listByContact(contactA);
    const bRels = service.listByContact(contactB);

    expect(aRels[0].relationship_type).toBe('best_friend');
    expect(aRels[0].notes).toBe('BFFs');
    expect(bRels[0].relationship_type).toBe('best_friend');
    expect(bRels[0].notes).toBe('BFFs');
  });

  it('should update asymmetric types correctly', () => {
    const rel = service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'colleague',
    });

    service.update(rel.id, { relationship_type: 'boss' });

    const aRels = service.listByContact(contactA);
    const bRels = service.listByContact(contactB);

    expect(aRels[0].relationship_type).toBe('boss');
    expect(bRels[0].relationship_type).toBe('subordinate');
  });

  it('should remove a relationship and its inverse', () => {
    const rel = service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'sibling',
    });

    const success = service.remove(rel.id);
    expect(success).toBe(true);

    expect(service.listByContact(contactA)).toHaveLength(0);
    expect(service.listByContact(contactB)).toHaveLength(0);
  });

  it('should remove only the selected relationship and inverse when multiple relationships exist between two contacts', () => {
    const parentRel = service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'parent',
    });
    service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'colleague',
    });

    const success = service.remove(parentRel.id);
    expect(success).toBe(true);

    const aRels = service.listByContact(contactA);
    const bRels = service.listByContact(contactB);

    expect(aRels).toHaveLength(1);
    expect(aRels[0]).toMatchObject({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'colleague',
    });
    expect(aRels.map((rel) => rel.relationship_type)).not.toContain('parent');

    expect(bRels).toHaveLength(1);
    expect(bRels[0]).toMatchObject({
      contact_id: contactB,
      related_contact_id: contactA,
      relationship_type: 'colleague',
    });
    expect(bRels.map((rel) => rel.relationship_type)).not.toContain('child');
  });

  it('should return false for removing non-existent relationship', () => {
    expect(service.remove('nonexistent')).toBe(false);
  });

  it('should return null for updating non-existent relationship', () => {
    expect(service.update('nonexistent', { notes: 'test' })).toBeNull();
  });

  it('should handle multiple relationships for same contact', () => {
    const contactC = createTestContact(db, userId, { firstName: 'Charlie' });

    service.add({ contact_id: contactA, related_contact_id: contactB, relationship_type: 'friend' });
    service.add({ contact_id: contactA, related_contact_id: contactC, relationship_type: 'colleague' });

    const rels = service.listByContact(contactA);
    expect(rels).toHaveLength(2);
  });

  it('should create custom relationship types and include them in merged options', () => {
    const customTypes = new CustomRelationshipTypeService(db);
    const created = customTypes.create(userId, {
      label: 'External mentor',
      inverse_value: 'External Mentee',
    });

    expect(created.value).toBe('external_mentor');
    expect(created.label).toBe('External mentor');
    expect(created.inverse_value).toBe('external_mentee');

    const options = getRelationshipTypeOptionsForUser(db, userId);
    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'parent', category: 'Family', source: 'canonical' }),
      expect.objectContaining({ value: 'external_mentor', label: 'External mentor', category: 'Custom', source: 'custom' }),
      expect.objectContaining({ value: 'external_mentee', inverse_value: 'external_mentor', category: 'Custom', source: 'custom' }),
    ]));

    const updated = customTypes.update(userId, created.id, {
      label: 'Board mentor',
      inverse_value: 'Board Mentee',
    });
    expect(updated).toMatchObject({ value: 'board_mentor', label: 'Board mentor', inverse_value: 'board_mentee' });

    expect(customTypes.delete(userId, created.id)).toBe(true);
    expect(customTypes.get(userId, created.id)).toBeNull();
  });

  it('should default inverse value to the derived label value when blank', () => {
    const customTypes = new CustomRelationshipTypeService(db);
    const created = customTypes.create(userId, { label: 'Accountability Buddy', inverse_value: '   ' });

    expect(created).toMatchObject({
      value: 'accountability_buddy',
      label: 'Accountability Buddy',
      inverse_value: 'accountability_buddy',
    });
    expect(getInverseTypeForUser(db, userId, 'accountability_buddy')).toBe('accountability_buddy');
  });

  it('should reject labels that do not produce a relationship type value', () => {
    const customTypes = new CustomRelationshipTypeService(db);

    expect(() => customTypes.create(userId, { label: '!!!' })).toThrow('Label must include at least one letter or number');
  });

  it('should return a friendly error when derived custom values collide', () => {
    const customTypes = new CustomRelationshipTypeService(db);
    customTypes.create(userId, { label: 'External Mentor' });

    expect(() => customTypes.create(userId, { label: 'external mentor!!!' }))
      .toThrow('A relationship type with a similar name already exists');
  });

  it('should resolve custom inverse types for create and update', () => {
    const customTypes = new CustomRelationshipTypeService(db);
    customTypes.create(userId, {
      label: 'Coach',
      inverse_value: 'Player',
    });

    expect(getInverseTypeForUser(db, userId, 'coach')).toBe('player');
    expect(getInverseTypeForUser(db, userId, 'player')).toBe('coach');

    const rel = service.add({
      contact_id: contactA,
      related_contact_id: contactB,
      relationship_type: 'coach',
    });
    expect(service.listByContact(contactB)[0].relationship_type).toBe('player');

    service.update(rel.id, { relationship_type: 'player' });
    expect(service.listByContact(contactA)[0].relationship_type).toBe('player');
    expect(service.listByContact(contactB)[0].relationship_type).toBe('coach');
  });
});
