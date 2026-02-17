import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ReminderService } from '../../src/services/reminders.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('ReminderService', () => {
  let db: Database.Database;
  let service: ReminderService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new ReminderService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice' });
  });

  afterEach(() => closeDatabase(db));

  it('should create a one-time reminder', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Call Alice',
      description: 'Follow up on project',
      reminder_date: '2024-07-01',
    });

    expect(reminder.id).toBeDefined();
    expect(reminder.contact_id).toBe(contactId);
    expect(reminder.title).toBe('Call Alice');
    expect(reminder.description).toBe('Follow up on project');
    expect(reminder.reminder_date).toBe('2024-07-01');
    expect(reminder.frequency).toBe('one_time');
    expect(reminder.status).toBe('active');
    expect(reminder.is_auto_generated).toBe(false);
  });

  it('should create a recurring reminder', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Weekly check-in',
      reminder_date: '2024-07-01',
      frequency: 'weekly',
    });

    expect(reminder.frequency).toBe('weekly');
  });

  it('should get a reminder by ID', () => {
    const created = service.create(userId, {
      contact_id: contactId,
      title: 'Test',
      reminder_date: '2024-07-01',
    });

    const fetched = service.get(userId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('should return null for non-existent reminder', () => {
    expect(service.get(userId, 'nonexistent')).toBeNull();
  });

  it('should update a reminder', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Old Title',
      reminder_date: '2024-07-01',
    });

    const updated = service.update(userId, reminder.id, {
      title: 'New Title',
      reminder_date: '2024-07-15',
    });

    expect(updated!.title).toBe('New Title');
    expect(updated!.reminder_date).toBe('2024-07-15');
  });

  it('should return null when updating non-existent reminder', () => {
    expect(service.update(userId, 'nonexistent', { title: 'test' })).toBeNull();
  });

  it('should complete a one-time reminder', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'One-time task',
      reminder_date: '2024-07-01',
      frequency: 'one_time',
    });

    const completed = service.complete(userId, reminder.id);
    expect(completed!.status).toBe('completed');
  });

  it('should advance a recurring weekly reminder on complete', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Weekly check-in',
      reminder_date: '2024-07-01',
      frequency: 'weekly',
    });

    const advanced = service.complete(userId, reminder.id);
    expect(advanced!.status).toBe('active');
    expect(advanced!.reminder_date).toBe('2024-07-08');
  });

  it('should advance a monthly reminder on complete', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Monthly review',
      reminder_date: '2024-07-01',
      frequency: 'monthly',
    });

    const advanced = service.complete(userId, reminder.id);
    expect(advanced!.reminder_date).toBe('2024-08-01');
  });

  it('should advance a yearly reminder on complete', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Annual birthday',
      reminder_date: '2024-07-01',
      frequency: 'yearly',
    });

    const advanced = service.complete(userId, reminder.id);
    expect(advanced!.reminder_date).toBe('2025-07-01');
  });

  it('should snooze a reminder', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Snoozable',
      reminder_date: '2024-07-01',
    });

    const snoozed = service.snooze(userId, reminder.id, '2024-07-05');
    expect(snoozed!.status).toBe('snoozed');
    expect(snoozed!.reminder_date).toBe('2024-07-05');
  });

  it('should dismiss a reminder', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'Dismissable',
      reminder_date: '2024-07-01',
    });

    expect(service.dismiss(userId, reminder.id)).toBe(true);
    const fetched = service.get(userId, reminder.id);
    expect(fetched!.status).toBe('dismissed');
  });

  it('should soft-delete a reminder', () => {
    const reminder = service.create(userId, {
      contact_id: contactId,
      title: 'To delete',
      reminder_date: '2024-07-01',
    });

    expect(service.softDelete(userId, reminder.id)).toBe(true);
    expect(service.get(userId, reminder.id)).toBeNull();
  });

  it('should return false when deleting non-existent reminder', () => {
    expect(service.softDelete(userId, 'nonexistent')).toBe(false);
  });

  it('should list reminders', () => {
    service.create(userId, { contact_id: contactId, title: 'R1', reminder_date: '2024-07-01' });
    service.create(userId, { contact_id: contactId, title: 'R2', reminder_date: '2024-07-02' });

    const result = service.list(userId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should filter reminders by contact', () => {
    const contactB = createTestContact(db, userId, { firstName: 'Bob' });
    service.create(userId, { contact_id: contactId, title: 'Alice R', reminder_date: '2024-07-01' });
    service.create(userId, { contact_id: contactB, title: 'Bob R', reminder_date: '2024-07-02' });

    const result = service.list(userId, { contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Alice R');
  });

  it('should filter reminders by status', () => {
    const r1 = service.create(userId, { contact_id: contactId, title: 'Active', reminder_date: '2024-07-01' });
    service.create(userId, { contact_id: contactId, title: 'Completed', reminder_date: '2024-07-02' });
    service.complete(userId, service.list(userId).data[1].id); // complete the second one

    const result = service.list(userId, { status: 'active' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(r1.id);
  });

  it('should order reminders by date ascending', () => {
    service.create(userId, { contact_id: contactId, title: 'Later', reminder_date: '2024-08-01' });
    service.create(userId, { contact_id: contactId, title: 'Sooner', reminder_date: '2024-07-01' });

    const result = service.list(userId);
    expect(result.data[0].title).toBe('Sooner');
    expect(result.data[1].title).toBe('Later');
  });

  it('should create an auto-generated birthday reminder', () => {
    const reminder = service.createBirthdayReminder(userId, contactId, 'Alice Doe', '2024-06-15');
    expect(reminder.is_auto_generated).toBe(true);
    expect(reminder.frequency).toBe('yearly');
    expect(reminder.title).toBe("Alice Doe's birthday");
  });

  it('should remove auto-generated reminders', () => {
    service.createBirthdayReminder(userId, contactId, 'Alice', '2024-06-15');
    service.create(userId, { contact_id: contactId, title: 'Manual', reminder_date: '2024-07-01' });

    const removed = service.removeAutoReminders(userId, contactId);
    expect(removed).toBe(1);

    // Manual reminder should still exist
    const result = service.list(userId, { contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Manual');
  });

  it('should paginate reminders', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, {
        contact_id: contactId,
        title: `R${i}`,
        reminder_date: `2024-07-${String(i + 1).padStart(2, '0')}`,
      });
    }

    const page1 = service.list(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = service.list(userId, { page: 3, per_page: 2 });
    expect(page3.data).toHaveLength(1);
  });

  describe('restore', () => {
    it('should restore a soft-deleted reminder', () => {
      const reminder = service.create(userId, {
        contact_id: contactId,
        title: 'Restorable',
        reminder_date: '2024-07-01',
      });
      service.softDelete(userId, reminder.id);

      expect(service.get(userId, reminder.id)).toBeNull();

      const restored = service.restore(userId, reminder.id);
      expect(restored.id).toBe(reminder.id);
      expect(restored.title).toBe('Restorable');
      expect(restored.deleted_at).toBeNull();

      expect(service.get(userId, reminder.id)).not.toBeNull();
    });

    it('should throw error when restoring non-existent reminder', () => {
      expect(() => service.restore(userId, 'nonexistent')).toThrow('Reminder not found or not deleted');
    });

    it('should throw error when restoring a reminder that is not deleted', () => {
      const reminder = service.create(userId, {
        contact_id: contactId,
        title: 'Active',
        reminder_date: '2024-07-01',
      });
      expect(() => service.restore(userId, reminder.id)).toThrow('Reminder not found or not deleted');
    });

    it('should not restore reminders belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherContactId = createTestContact(db, otherUserId);
      const otherService = new ReminderService(db);
      const reminder = otherService.create(otherUserId, {
        contact_id: otherContactId,
        title: 'Other',
        reminder_date: '2024-07-01',
      });
      otherService.softDelete(otherUserId, reminder.id);

      expect(() => service.restore(userId, reminder.id)).toThrow('Reminder not found or not deleted');
    });
  });

  describe('list with include_deleted', () => {
    it('should include soft-deleted reminders when include_deleted is true', () => {
      const reminder = service.create(userId, {
        contact_id: contactId,
        title: 'Deleted',
        reminder_date: '2024-07-01',
      });
      service.create(userId, {
        contact_id: contactId,
        title: 'Kept',
        reminder_date: '2024-07-02',
      });
      service.softDelete(userId, reminder.id);

      const withDeleted = service.list(userId, { include_deleted: true });
      expect(withDeleted.total).toBe(2);

      const withoutDeleted = service.list(userId);
      expect(withoutDeleted.total).toBe(1);
    });
  });
});
