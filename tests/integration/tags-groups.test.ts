import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TagService } from '../../src/services/tags-groups.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('TagService', () => {
  let db: Database.Database;
  let service: TagService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new TagService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId);
  });

  afterEach(() => closeDatabase(db));

  it('should create a tag', () => {
    const tag = service.create(userId, 'VIP');
    expect(tag.name).toBe('VIP');
    expect(tag.user_id).toBe(userId);
  });

  it('should create a tag with color', () => {
    const tag = service.create(userId, 'Important', '#ff0000');
    expect(tag.color).toBe('#ff0000');
  });

  it('should return existing tag if name matches (on-the-fly)', () => {
    const tag1 = service.create(userId, 'Friends');
    const tag2 = service.create(userId, 'Friends');
    expect(tag1.id).toBe(tag2.id);
  });

  it('should update a tag', () => {
    const tag = service.create(userId, 'Old Name');
    const updated = service.update(userId, tag.id, { name: 'New Name', color: '#00ff00' });
    expect(updated!.name).toBe('New Name');
    expect(updated!.color).toBe('#00ff00');
  });

  it('should delete a tag', () => {
    const tag = service.create(userId, 'ToDelete');
    expect(service.delete(userId, tag.id)).toBe(true);
    expect(service.list(userId)).toHaveLength(0);
  });

  it('should list tags sorted by name', () => {
    service.create(userId, 'Zebra');
    service.create(userId, 'Apple');
    service.create(userId, 'Mango');

    const tags = service.list(userId);
    expect(tags.map((t) => t.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('should tag a contact', () => {
    const tag = service.tagContact(userId, contactId, 'Friend');
    expect(tag.name).toBe('Friend');

    const contactTags = service.listByContact(contactId);
    expect(contactTags).toHaveLength(1);
    expect(contactTags[0].name).toBe('Friend');
  });

  it('should not duplicate tag on same contact', () => {
    service.tagContact(userId, contactId, 'Friend');
    service.tagContact(userId, contactId, 'Friend');

    const contactTags = service.listByContact(contactId);
    expect(contactTags).toHaveLength(1);
  });

  it('should untag a contact', () => {
    const tag = service.tagContact(userId, contactId, 'Temp');
    expect(service.untagContact(contactId, tag.id)).toBe(true);
    expect(service.listByContact(contactId)).toHaveLength(0);
  });

  it('should return false when untagging non-existent tag', () => {
    expect(service.untagContact(contactId, 'nonexistent')).toBe(false);
  });

  it('should tag contact with multiple tags', () => {
    service.tagContact(userId, contactId, 'Friend');
    service.tagContact(userId, contactId, 'VIP');
    service.tagContact(userId, contactId, 'Local');

    const contactTags = service.listByContact(contactId);
    expect(contactTags).toHaveLength(3);
  });
});
