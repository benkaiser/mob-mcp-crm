import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NoteService } from '../../src/services/notes.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('NoteService', () => {
  let db: Database.Database;
  let service: NoteService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new NoteService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId);
  });

  afterEach(() => closeDatabase(db));

  it('should create a note', () => {
    const note = service.create(userId, {
      contact_id: contactId,
      body: 'Met at a conference, loves hiking.',
    });

    expect(note.body).toBe('Met at a conference, loves hiking.');
    expect(note.title).toBeNull();
    expect(note.is_pinned).toBe(false);
  });

  it('should create a note with title and pinned', () => {
    const note = service.create(userId, {
      contact_id: contactId,
      title: 'Important',
      body: '# Key info\n\nAlways call before visiting.',
      is_pinned: true,
    });

    expect(note.title).toBe('Important');
    expect(note.is_pinned).toBe(true);
  });

  it('should get a note by ID', () => {
    const created = service.create(userId, {
      contact_id: contactId,
      body: 'Test note',
    });

    const fetched = service.get(userId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.body).toBe('Test note');
  });

  it('should update a note', () => {
    const note = service.create(userId, {
      contact_id: contactId,
      body: 'Original body',
    });

    const updated = service.update(userId, note.id, {
      title: 'Added title',
      body: 'Updated body',
      is_pinned: true,
    });

    expect(updated!.title).toBe('Added title');
    expect(updated!.body).toBe('Updated body');
    expect(updated!.is_pinned).toBe(true);
  });

  it('should return null when updating non-existent note', () => {
    expect(service.update(userId, 'nonexistent', { body: 'test' })).toBeNull();
  });

  it('should soft-delete a note', () => {
    const note = service.create(userId, {
      contact_id: contactId,
      body: 'Will be deleted',
    });

    const success = service.softDelete(userId, note.id);
    expect(success).toBe(true);

    // Should not be retrievable
    expect(service.get(userId, note.id)).toBeNull();
  });

  it('should return false for soft-deleting non-existent note', () => {
    expect(service.softDelete(userId, 'nonexistent')).toBe(false);
  });

  it('should list notes with pinned first', () => {
    service.create(userId, { contact_id: contactId, body: 'Regular note' });
    service.create(userId, { contact_id: contactId, body: 'Pinned note', is_pinned: true });
    service.create(userId, { contact_id: contactId, body: 'Another regular note' });

    const result = service.listByContact(userId, contactId);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.data[0].is_pinned).toBe(true);
    expect(result.data[0].body).toBe('Pinned note');
  });

  it('should not list soft-deleted notes', () => {
    const note = service.create(userId, { contact_id: contactId, body: 'Will delete' });
    service.create(userId, { contact_id: contactId, body: 'Will keep' });

    service.softDelete(userId, note.id);

    const result = service.listByContact(userId, contactId);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should paginate notes', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, { contact_id: contactId, body: `Note ${i}` });
    }

    const page1 = service.listByContact(userId, contactId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.per_page).toBe(2);

    const page3 = service.listByContact(userId, contactId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });

  describe('restore', () => {
    it('should restore a soft-deleted note', () => {
      const note = service.create(userId, {
        contact_id: contactId,
        body: 'Restorable note',
        title: 'Test',
      });
      service.softDelete(userId, note.id);

      expect(service.get(userId, note.id)).toBeNull();

      const restored = service.restore(userId, note.id);
      expect(restored.id).toBe(note.id);
      expect(restored.body).toBe('Restorable note');
      expect(restored.deleted_at).toBeNull();

      expect(service.get(userId, note.id)).not.toBeNull();
    });

    it('should throw error when restoring non-existent note', () => {
      expect(() => service.restore(userId, 'nonexistent')).toThrow('Note not found or not deleted');
    });

    it('should throw error when restoring a note that is not deleted', () => {
      const note = service.create(userId, {
        contact_id: contactId,
        body: 'Active note',
      });
      expect(() => service.restore(userId, note.id)).toThrow('Note not found or not deleted');
    });

    it('should not restore notes belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherContactId = createTestContact(db, otherUserId);
      const otherService = new NoteService(db);
      const note = otherService.create(otherUserId, {
        contact_id: otherContactId,
        body: 'Other user note',
      });
      otherService.softDelete(otherUserId, note.id);

      expect(() => service.restore(userId, note.id)).toThrow('Note not found or not deleted');
    });
  });

  describe('listByContact with include_deleted', () => {
    it('should include soft-deleted notes when include_deleted is true', () => {
      const note = service.create(userId, { contact_id: contactId, body: 'Will delete' });
      service.create(userId, { contact_id: contactId, body: 'Will keep' });
      service.softDelete(userId, note.id);

      const withDeleted = service.listByContact(userId, contactId, { include_deleted: true });
      expect(withDeleted.total).toBe(2);

      const withoutDeleted = service.listByContact(userId, contactId);
      expect(withoutDeleted.total).toBe(1);
    });
  });
});
