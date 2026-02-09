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
    const note = service.create({
      contact_id: contactId,
      body: 'Met at a conference, loves hiking.',
    });

    expect(note.body).toBe('Met at a conference, loves hiking.');
    expect(note.title).toBeNull();
    expect(note.is_pinned).toBe(false);
  });

  it('should create a note with title and pinned', () => {
    const note = service.create({
      contact_id: contactId,
      title: 'Important',
      body: '# Key info\n\nAlways call before visiting.',
      is_pinned: true,
    });

    expect(note.title).toBe('Important');
    expect(note.is_pinned).toBe(true);
  });

  it('should get a note by ID', () => {
    const created = service.create({
      contact_id: contactId,
      body: 'Test note',
    });

    const fetched = service.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.body).toBe('Test note');
  });

  it('should update a note', () => {
    const note = service.create({
      contact_id: contactId,
      body: 'Original body',
    });

    const updated = service.update(note.id, {
      title: 'Added title',
      body: 'Updated body',
      is_pinned: true,
    });

    expect(updated!.title).toBe('Added title');
    expect(updated!.body).toBe('Updated body');
    expect(updated!.is_pinned).toBe(true);
  });

  it('should return null when updating non-existent note', () => {
    expect(service.update('nonexistent', { body: 'test' })).toBeNull();
  });

  it('should soft-delete a note', () => {
    const note = service.create({
      contact_id: contactId,
      body: 'Will be deleted',
    });

    const success = service.softDelete(note.id);
    expect(success).toBe(true);

    // Should not be retrievable
    expect(service.get(note.id)).toBeNull();
  });

  it('should return false for soft-deleting non-existent note', () => {
    expect(service.softDelete('nonexistent')).toBe(false);
  });

  it('should list notes with pinned first', () => {
    service.create({ contact_id: contactId, body: 'Regular note' });
    service.create({ contact_id: contactId, body: 'Pinned note', is_pinned: true });
    service.create({ contact_id: contactId, body: 'Another regular note' });

    const result = service.listByContact(contactId);
    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.data[0].is_pinned).toBe(true);
    expect(result.data[0].body).toBe('Pinned note');
  });

  it('should not list soft-deleted notes', () => {
    const note = service.create({ contact_id: contactId, body: 'Will delete' });
    service.create({ contact_id: contactId, body: 'Will keep' });

    service.softDelete(note.id);

    const result = service.listByContact(contactId);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should paginate notes', () => {
    for (let i = 0; i < 5; i++) {
      service.create({ contact_id: contactId, body: `Note ${i}` });
    }

    const page1 = service.listByContact(contactId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.per_page).toBe(2);

    const page3 = service.listByContact(contactId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });
});
