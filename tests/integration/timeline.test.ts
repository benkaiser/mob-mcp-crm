import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TimelineService } from '../../src/services/timeline.js';
import { ActivityService } from '../../src/services/activities.js';
import { LifeEventService } from '../../src/services/life-events.js';
import { NoteService } from '../../src/services/notes.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('TimelineService', () => {
  let db: Database.Database;
  let timelineService: TimelineService;
  let activityService: ActivityService;
  let lifeEventService: LifeEventService;
  let noteService: NoteService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    timelineService = new TimelineService(db);
    activityService = new ActivityService(db);
    lifeEventService = new LifeEventService(db);
    noteService = new NoteService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice' });
  });

  afterEach(() => closeDatabase(db));

  it('should return contact_created entry for new contact', () => {
    const result = timelineService.getTimeline(contactId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('contact_created');
    expect(result.data[0].title).toContain('Alice');
  });

  it('should include activities in timeline', () => {
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Quick call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactId],
    });

    const result = timelineService.getTimeline(contactId);
    const activityEntries = result.data.filter((e) => e.type === 'activity');
    expect(activityEntries).toHaveLength(1);
    expect(activityEntries[0].title).toBe('Quick call');
    expect(activityEntries[0].metadata).toHaveProperty('activity_type', 'phone_call');
  });

  it('should include life events in timeline', () => {
    lifeEventService.create({
      contact_id: contactId,
      event_type: 'new_job',
      title: 'Started at Google',
      occurred_at: '2024-03-01',
    });

    const result = timelineService.getTimeline(contactId);
    const lifeEventEntries = result.data.filter((e) => e.type === 'life_event');
    expect(lifeEventEntries).toHaveLength(1);
    expect(lifeEventEntries[0].title).toBe('Started at Google');
    expect(lifeEventEntries[0].metadata).toHaveProperty('event_type', 'new_job');
  });

  it('should include notes in timeline', () => {
    noteService.create({
      contact_id: contactId,
      body: 'Met at the conference',
      title: 'Conference Notes',
    });

    const result = timelineService.getTimeline(contactId);
    const noteEntries = result.data.filter((e) => e.type === 'note');
    expect(noteEntries).toHaveLength(1);
    expect(noteEntries[0].title).toBe('Conference Notes');
    expect(noteEntries[0].description).toBe('Met at the conference');
  });

  it('should sort all entries by occurred_at descending', () => {
    // Create entries at different times
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactId],
    });

    lifeEventService.create({
      contact_id: contactId,
      event_type: 'moved',
      title: 'Moved',
      occurred_at: '2024-08-01T00:00:00Z',
    });

    const result = timelineService.getTimeline(contactId);

    // Moved (Aug) should come before Call (Jun) which should come before contact_created
    const types = result.data.map((e) => e.type);
    const movedIndex = types.indexOf('life_event');
    const callIndex = types.indexOf('activity');
    expect(movedIndex).toBeLessThan(callIndex);
  });

  it('should filter by entry_type', () => {
    activityService.create(userId, {
      type: 'phone_call',
      title: 'Call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactId],
    });

    lifeEventService.create({
      contact_id: contactId,
      event_type: 'moved',
      title: 'Moved',
      occurred_at: '2024-08-01',
    });

    noteService.create({
      contact_id: contactId,
      body: 'A note',
    });

    // Filter only activities
    const activityResult = timelineService.getTimeline(contactId, { entry_type: 'activity' });
    expect(activityResult.data.every((e) => e.type === 'activity')).toBe(true);
    expect(activityResult.data).toHaveLength(1);

    // Filter only life events
    const lifeEventResult = timelineService.getTimeline(contactId, { entry_type: 'life_event' });
    expect(lifeEventResult.data.every((e) => e.type === 'life_event')).toBe(true);
    expect(lifeEventResult.data).toHaveLength(1);

    // Filter only notes
    const noteResult = timelineService.getTimeline(contactId, { entry_type: 'note' });
    expect(noteResult.data.every((e) => e.type === 'note')).toBe(true);
    expect(noteResult.data).toHaveLength(1);

    // Filter only contact_created
    const createdResult = timelineService.getTimeline(contactId, { entry_type: 'contact_created' });
    expect(createdResult.data.every((e) => e.type === 'contact_created')).toBe(true);
    expect(createdResult.data).toHaveLength(1);
  });

  it('should paginate timeline', () => {
    // Create multiple entries
    for (let i = 0; i < 5; i++) {
      activityService.create(userId, {
        type: 'phone_call',
        title: `Call ${i}`,
        occurred_at: `2024-06-${String(i + 10).padStart(2, '0')}T10:00:00Z`,
        participant_contact_ids: [contactId],
      });
    }

    // 5 activities + 1 contact_created = 6 total
    const page1 = timelineService.getTimeline(contactId, { page: 1, per_page: 3 });
    expect(page1.data).toHaveLength(3);
    expect(page1.total).toBe(6);
    expect(page1.page).toBe(1);
    expect(page1.per_page).toBe(3);

    const page2 = timelineService.getTimeline(contactId, { page: 2, per_page: 3 });
    expect(page2.data).toHaveLength(3);
  });

  it('should exclude deleted activities from timeline', () => {
    const activity = activityService.create(userId, {
      type: 'phone_call',
      title: 'Deleted call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactId],
    });

    activityService.softDelete(userId, activity.id);

    const result = timelineService.getTimeline(contactId);
    const activityEntries = result.data.filter((e) => e.type === 'activity');
    expect(activityEntries).toHaveLength(0);
  });

  it('should exclude deleted life events from timeline', () => {
    const event = lifeEventService.create({
      contact_id: contactId,
      event_type: 'moved',
      title: 'Deleted move',
      occurred_at: '2024-08-01',
    });

    lifeEventService.softDelete(event.id);

    const result = timelineService.getTimeline(contactId);
    const lifeEventEntries = result.data.filter((e) => e.type === 'life_event');
    expect(lifeEventEntries).toHaveLength(0);
  });

  it('should exclude deleted notes from timeline', () => {
    const note = noteService.create({
      contact_id: contactId,
      body: 'Deleted note',
    });

    noteService.softDelete(note.id);

    const result = timelineService.getTimeline(contactId);
    const noteEntries = result.data.filter((e) => e.type === 'note');
    expect(noteEntries).toHaveLength(0);
  });

  it('should handle empty timeline for non-existent contact', () => {
    const result = timelineService.getTimeline('nonexistent');
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should use activity type as title fallback', () => {
    activityService.create(userId, {
      type: 'phone_call',
      occurred_at: '2024-06-15T10:00:00Z',
      participant_contact_ids: [contactId],
    });

    const result = timelineService.getTimeline(contactId, { entry_type: 'activity' });
    expect(result.data[0].title).toBe('phone call');
  });

  it('should use "Note" as title fallback for untitled notes', () => {
    noteService.create({
      contact_id: contactId,
      body: 'Just a body',
    });

    const result = timelineService.getTimeline(contactId, { entry_type: 'note' });
    expect(result.data[0].title).toBe('Note');
  });

  it('should include metadata fields in activity entries', () => {
    activityService.create(userId, {
      type: 'in_person',
      occurred_at: '2024-06-15T10:00:00Z',
      duration_minutes: 60,
      location: 'Central Park',
      participant_contact_ids: [contactId],
    });

    const result = timelineService.getTimeline(contactId, { entry_type: 'activity' });
    expect(result.data[0].metadata).toEqual({
      activity_type: 'in_person',
      duration_minutes: 60,
      location: 'Central Park',
    });
  });

  it('should include is_pinned in note metadata', () => {
    noteService.create({
      contact_id: contactId,
      body: 'Pinned note',
      is_pinned: true,
    });

    const result = timelineService.getTimeline(contactId, { entry_type: 'note' });
    expect(result.data[0].metadata).toEqual({ is_pinned: true });
  });
});
