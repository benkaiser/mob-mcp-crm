import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TaskService } from '../../src/services/tasks.js';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('TaskService', () => {
  let db: Database.Database;
  let service: TaskService;
  let userId: string;
  let contactId: string;

  beforeEach(() => {
    db = createTestDatabase();
    service = new TaskService(db);
    userId = createTestUser(db);
    contactId = createTestContact(db, userId, { firstName: 'Alice' });
  });

  afterEach(() => closeDatabase(db));

  it('should create a task', () => {
    const task = service.create(userId, {
      title: 'Send thank you note',
      description: 'For the birthday gift',
      contact_id: contactId,
      due_date: '2024-07-15',
      priority: 'high',
    });

    expect(task.id).toBeDefined();
    expect(task.user_id).toBe(userId);
    expect(task.contact_id).toBe(contactId);
    expect(task.title).toBe('Send thank you note');
    expect(task.description).toBe('For the birthday gift');
    expect(task.due_date).toBe('2024-07-15');
    expect(task.priority).toBe('high');
    expect(task.status).toBe('pending');
    expect(task.completed_at).toBeNull();
  });

  it('should create a task without contact', () => {
    const task = service.create(userId, {
      title: 'General task',
    });

    expect(task.contact_id).toBeNull();
    expect(task.priority).toBe('medium');
  });

  it('should get a task by ID', () => {
    const created = service.create(userId, { title: 'Test' });

    const fetched = service.get(userId, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it('should return null for non-existent task', () => {
    expect(service.get(userId, 'nonexistent')).toBeNull();
  });

  it('should update a task', () => {
    const task = service.create(userId, { title: 'Old Title' });

    const updated = service.update(userId, task.id, {
      title: 'New Title',
      priority: 'low',
      due_date: '2024-08-01',
    });

    expect(updated!.title).toBe('New Title');
    expect(updated!.priority).toBe('low');
    expect(updated!.due_date).toBe('2024-08-01');
  });

  it('should update task status', () => {
    const task = service.create(userId, { title: 'In progress task' });

    const updated = service.update(userId, task.id, { status: 'in_progress' });
    expect(updated!.status).toBe('in_progress');
  });

  it('should return null when updating non-existent task', () => {
    expect(service.update(userId, 'nonexistent', { title: 'test' })).toBeNull();
  });

  it('should complete a task', () => {
    const task = service.create(userId, { title: 'To complete' });

    const completed = service.complete(userId, task.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.completed_at).not.toBeNull();
  });

  it('should return null when completing non-existent task', () => {
    expect(service.complete(userId, 'nonexistent')).toBeNull();
  });

  it('should soft-delete a task', () => {
    const task = service.create(userId, { title: 'To delete' });

    expect(service.softDelete(userId, task.id)).toBe(true);
    expect(service.get(userId, task.id)).toBeNull();
  });

  it('should return false when deleting non-existent task', () => {
    expect(service.softDelete(userId, 'nonexistent')).toBe(false);
  });

  it('should list tasks', () => {
    service.create(userId, { title: 'T1' });
    service.create(userId, { title: 'T2' });

    const result = service.list(userId);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('should filter tasks by contact', () => {
    service.create(userId, { title: 'With contact', contact_id: contactId });
    service.create(userId, { title: 'Without contact' });

    const result = service.list(userId, { contact_id: contactId });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('With contact');
  });

  it('should filter tasks by status', () => {
    service.create(userId, { title: 'Pending' });
    const t2 = service.create(userId, { title: 'Completed' });
    service.complete(userId, t2.id);

    const result = service.list(userId, { status: 'pending' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Pending');
  });

  it('should filter tasks by priority', () => {
    service.create(userId, { title: 'High', priority: 'high' });
    service.create(userId, { title: 'Low', priority: 'low' });

    const result = service.list(userId, { priority: 'high' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('High');
  });

  it('should order tasks by priority then due date', () => {
    service.create(userId, { title: 'Low later', priority: 'low', due_date: '2024-08-01' });
    service.create(userId, { title: 'High later', priority: 'high', due_date: '2024-08-01' });
    service.create(userId, { title: 'High sooner', priority: 'high', due_date: '2024-07-01' });

    const result = service.list(userId);
    expect(result.data[0].title).toBe('High sooner');
    expect(result.data[1].title).toBe('High later');
    expect(result.data[2].title).toBe('Low later');
  });

  it('should exclude soft-deleted tasks', () => {
    const task = service.create(userId, { title: 'Deleted' });
    service.create(userId, { title: 'Kept' });

    service.softDelete(userId, task.id);
    const result = service.list(userId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Kept');
  });

  it('should paginate tasks', () => {
    for (let i = 0; i < 5; i++) {
      service.create(userId, { title: `Task ${i}` });
    }

    const page1 = service.list(userId, { page: 1, per_page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });

  it('should link and unlink a contact', () => {
    const task = service.create(userId, { title: 'Linkable', contact_id: contactId });
    expect(task.contact_id).toBe(contactId);

    const unlinked = service.update(userId, task.id, { contact_id: null });
    expect(unlinked!.contact_id).toBeNull();
  });

  describe('restore', () => {
    it('should restore a soft-deleted task', () => {
      const task = service.create(userId, { title: 'Restorable task' });
      service.softDelete(userId, task.id);

      expect(service.get(userId, task.id)).toBeNull();

      const restored = service.restore(userId, task.id);
      expect(restored.id).toBe(task.id);
      expect(restored.title).toBe('Restorable task');
      expect(restored.deleted_at).toBeNull();

      expect(service.get(userId, task.id)).not.toBeNull();
    });

    it('should throw error when restoring non-existent task', () => {
      expect(() => service.restore(userId, 'nonexistent')).toThrow('Task not found or not deleted');
    });

    it('should throw error when restoring a task that is not deleted', () => {
      const task = service.create(userId, { title: 'Active task' });
      expect(() => service.restore(userId, task.id)).toThrow('Task not found or not deleted');
    });

    it('should not restore tasks belonging to other users', () => {
      const otherUserId = createTestUser(db, { email: 'other@example.com' });
      const otherService = new TaskService(db);
      const task = otherService.create(otherUserId, { title: 'Other task' });
      otherService.softDelete(otherUserId, task.id);

      expect(() => service.restore(userId, task.id)).toThrow('Task not found or not deleted');
    });
  });

  describe('list with include_deleted', () => {
    it('should include soft-deleted tasks when include_deleted is true', () => {
      const task = service.create(userId, { title: 'Deleted' });
      service.create(userId, { title: 'Kept' });
      service.softDelete(userId, task.id);

      const withDeleted = service.list(userId, { include_deleted: true });
      expect(withDeleted.total).toBe(2);

      const withoutDeleted = service.list(userId);
      expect(withoutDeleted.total).toBe(1);
    });
  });
});
