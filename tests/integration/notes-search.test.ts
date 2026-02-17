import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { NoteService } from '../../src/services/notes.js';
import { TagService } from '../../src/services/tags-groups.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('NoteService.searchNotes', () => {
  let db: Database.Database;
  let noteService: NoteService;
  let tagService: TagService;
  let userId: string;
  let contactId: string;
  let contactId2: string;

  beforeEach(() => {
    db = createTestDatabase();
    noteService = new NoteService(db);
    tagService = new TagService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice', lastName: 'Smith' });
    contactId2 = createTestContact(db, userId, { firstName: 'Bob', lastName: 'Jones' });
  });

  afterEach(() => closeDatabase(db));

  it('should return all notes across contacts when no filters', () => {
    noteService.create(userId, { contact_id: contactId, body: 'Note 1' });
    noteService.create(userId, { contact_id: contactId2, body: 'Note 2' });

    const result = noteService.searchNotes(userId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should search by query in title and body', () => {
    noteService.create(userId, { contact_id: contactId, title: 'Project meeting', body: 'Discussed the timeline' });
    noteService.create(userId, { contact_id: contactId2, title: 'Lunch', body: 'Had sushi at the restaurant' });

    const result = noteService.searchNotes(userId, { query: 'project' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Project meeting');
  });

  it('should search in body text', () => {
    noteService.create(userId, { contact_id: contactId, title: 'A', body: 'Contains the keyword Tokyo here' });
    noteService.create(userId, { contact_id: contactId2, title: 'B', body: 'Nothing relevant' });

    const result = noteService.searchNotes(userId, { query: 'Tokyo' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('A');
  });

  it('should filter by tag name', () => {
    tagService.tagContact(userId, contactId, 'friends');
    noteService.create(userId, { contact_id: contactId, body: 'Friend note' });
    noteService.create(userId, { contact_id: contactId2, body: 'Other note' });

    const result = noteService.searchNotes(userId, { tag_name: 'friends' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Alice Smith');
  });

  it('should filter by pinned status', () => {
    noteService.create(userId, { contact_id: contactId, body: 'Pinned', is_pinned: true });
    noteService.create(userId, { contact_id: contactId, body: 'Not pinned' });

    const pinned = noteService.searchNotes(userId, { is_pinned: true });
    expect(pinned.data).toHaveLength(1);
    expect(pinned.data[0].body).toBe('Pinned');

    const unpinned = noteService.searchNotes(userId, { is_pinned: false });
    expect(unpinned.data).toHaveLength(1);
    expect(unpinned.data[0].body).toBe('Not pinned');
  });

  it('should filter by contact_id', () => {
    noteService.create(userId, { contact_id: contactId, body: 'Alice note' });
    noteService.create(userId, { contact_id: contactId2, body: 'Bob note' });

    const result = noteService.searchNotes(userId, { contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].contact_name).toBe('Alice Smith');
  });

  it('should sort by created_at ascending', () => {
    noteService.create(userId, { contact_id: contactId, title: 'First', body: 'A' });
    noteService.create(userId, { contact_id: contactId, title: 'Second', body: 'B' });

    const result = noteService.searchNotes(userId, { sort_by: 'created_at', sort_order: 'asc' });
    expect(result.data[0].title).toBe('First');
    expect(result.data[1].title).toBe('Second');
  });

  it('should sort by updated_at descending by default', () => {
    const note1 = noteService.create(userId, { contact_id: contactId, title: 'First', body: 'A' });
    const note2 = noteService.create(userId, { contact_id: contactId, title: 'Second', body: 'B' });
    // Force different updated_at timestamps
    db.prepare("UPDATE notes SET updated_at = '2025-01-01T00:00:00Z' WHERE id = ?").run(note1.id);
    db.prepare("UPDATE notes SET updated_at = '2025-06-01T00:00:00Z' WHERE id = ?").run(note2.id);

    const result = noteService.searchNotes(userId);
    // Descending: most recently updated first
    expect(result.data[0].title).toBe('Second');
  });

  it('should paginate results', () => {
    for (let i = 0; i < 5; i++) {
      noteService.create(userId, { contact_id: contactId, title: `Note ${i}`, body: `Body ${i}` });
    }

    const page1 = noteService.searchNotes(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.per_page).toBe(2);

    const page3 = noteService.searchNotes(userId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('should truncate long bodies and set body_truncated flag', () => {
    const longBody = 'x'.repeat(600);
    noteService.create(userId, { contact_id: contactId, body: longBody });
    noteService.create(userId, { contact_id: contactId, body: 'short' });

    const result = noteService.searchNotes(userId);
    const longNote = result.data.find(d => d.body.startsWith('xxx'));
    const shortNote = result.data.find(d => d.body === 'short');

    expect(longNote?.body_truncated).toBe(true);
    expect(longNote?.body.length).toBeLessThanOrEqual(504); // 500 + '...'
    expect(shortNote?.body_truncated).toBe(false);
  });

  it('should include contact name', () => {
    noteService.create(userId, { contact_id: contactId, body: 'Test' });

    const result = noteService.searchNotes(userId);
    expect(result.data[0].contact_name).toBe('Alice Smith');
    expect(result.data[0].contact_id).toBe(contactId);
  });

  it('should exclude soft-deleted notes', () => {
    const note = noteService.create(userId, { contact_id: contactId, body: 'To delete' });
    noteService.softDelete(userId, note.id);

    const result = noteService.searchNotes(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should exclude notes of soft-deleted contacts', () => {
    noteService.create(userId, { contact_id: contactId, body: 'Test' });
    db.prepare("UPDATE contacts SET deleted_at = datetime('now') WHERE id = ?").run(contactId);

    const result = noteService.searchNotes(userId);
    expect(result.data).toHaveLength(0);
  });

  it('should only return notes for the given user', () => {
    const otherUserId = createTestUser(db, { email: 'other@test.com' });
    const otherContact = createTestContact(db, otherUserId, { firstName: 'Other' });
    noteService.create(otherUserId, { contact_id: otherContact, body: 'Other user note' });
    noteService.create(userId, { contact_id: contactId, body: 'My note' });

    const result = noteService.searchNotes(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].body).toBe('My note');
  });
});
