import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  RelationshipService,
  CustomRelationshipTypeService,
  getInverseType,
  getInverseTypeForUser,
  getRelationshipTypeOptionsForUser,
  getRelationshipTypes,
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
      value: 'External Mentor',
      label: 'External mentor',
      inverse_value: 'External Mentee',
    });

    expect(created.value).toBe('external_mentor');
    expect(created.inverse_value).toBe('external_mentee');

    const options = getRelationshipTypeOptionsForUser(db, userId);
    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'parent', category: 'Family', source: 'canonical' }),
      expect.objectContaining({ value: 'external_mentor', label: 'External mentor', category: 'Custom', source: 'custom' }),
      expect.objectContaining({ value: 'external_mentee', inverse_value: 'external_mentor', category: 'Custom', source: 'custom' }),
    ]));

    const updated = customTypes.update(userId, created.id, {
      label: 'Board mentor',
      inverse_value: 'board_mentee',
    });
    expect(updated).toMatchObject({ value: 'external_mentor', label: 'Board mentor', inverse_value: 'board_mentee' });

    expect(customTypes.delete(userId, created.id)).toBe(true);
    expect(customTypes.get(userId, created.id)).toBeNull();
  });

  it('should resolve custom inverse types for create and update', () => {
    const customTypes = new CustomRelationshipTypeService(db);
    customTypes.create(userId, {
      value: 'coach',
      label: 'Coach',
      inverse_value: 'player',
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
