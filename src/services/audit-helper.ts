import type Database from 'better-sqlite3';
import { AuditService, type AuditAction } from './audit.js';

export function recordAudit(
  db: Database.Database,
  userId: string,
  entityType: string,
  entityId: string,
  action: AuditAction,
  oldValues?: unknown,
  newValues?: unknown,
): void {
  new AuditService(db).record(userId, {
    entity_type: entityType,
    entity_id: entityId,
    action,
    old_values: oldValues,
    new_values: newValues,
  });
}

export function userIdForContact(db: Database.Database, contactId: string): string | null {
  const row = db.prepare('SELECT user_id FROM contacts WHERE id = ?').get(contactId) as { user_id: string } | undefined;
  return row?.user_id ?? null;
}
