import type Database from 'better-sqlite3';
import { ContactService, type Contact } from './contacts.js';
import { ContactMethodService } from './contact-methods.js';
import { AddressService } from './addresses.js';
import { FoodPreferencesService } from './food-preferences.js';
import { CustomFieldService } from './custom-fields.js';
import { RelationshipService } from './relationships.js';
import { NoteService } from './notes.js';
import { TagService } from './tags-groups.js';
import { ActivityService } from './activities.js';
import { LifeEventService } from './life-events.js';
import { GiftService } from './gifts.js';
import { DebtService } from './debts.js';

/**
 * Assemble the fully-enriched contact profile in a single call: the contact
 * plus all related sub-entities. This is the canonical payload shared by the
 * MCP `contact_get` tool and the internal web API `GET /web/api/contacts/:id`,
 * so both heads return identical shapes.
 *
 * Returns null if the contact does not exist or is not owned by the user.
 */
export function getContactProfile(
  db: Database.Database,
  userId: string,
  contactId: string,
): (Contact & Record<string, unknown>) | null {
  const contacts = new ContactService(db);
  const contact = contacts.get(userId, contactId);
  if (!contact) return null;

  const contactMethods = new ContactMethodService(db);
  const addresses = new AddressService(db);
  const foodPreferences = new FoodPreferencesService(db);
  const customFields = new CustomFieldService(db);
  const relationships = new RelationshipService(db);
  const notes = new NoteService(db);
  const tags = new TagService(db);
  const activityService = new ActivityService(db);
  const lifeEvents = new LifeEventService(db);
  const giftService = new GiftService(db);
  const debtService = new DebtService(db);

  const recentNotes = notes.listByContact(userId, contactId, { per_page: 10 });
  const recentActivities = activityService.list(userId, { contact_id: contactId, per_page: 10 });
  const allLifeEvents = lifeEvents.listByContact(userId, contactId, { per_page: 1000 });

  // Active reminders (not completed/dismissed) for this contact
  const activeReminderRows = db.prepare(`
    SELECT r.* FROM reminders r
    JOIN contacts c ON r.contact_id = c.id
    WHERE r.contact_id = ? AND r.deleted_at IS NULL AND c.deleted_at IS NULL AND c.user_id = ?
      AND r.status NOT IN ('completed', 'dismissed')
    ORDER BY r.reminder_date ASC
  `).all(contactId, userId) as Record<string, unknown>[];
  const activeReminders = activeReminderRows.map((r) => ({
    ...r,
    is_auto_generated: Boolean(r.is_auto_generated),
  }));

  // Open tasks (not completed) for this contact
  const openTaskRows = db.prepare(`
    SELECT * FROM tasks
    WHERE contact_id = ? AND user_id = ? AND deleted_at IS NULL
      AND status != 'completed'
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END,
      due_date ASC NULLS LAST,
      created_at DESC
  `).all(contactId, userId) as Record<string, unknown>[];

  const recentGifts = giftService.list(userId, { contact_id: contactId, per_page: 10 });
  const activeDebts = debtService.list(userId, { contact_id: contactId, status: 'active' });
  const debtSummary = debtService.summary(userId, contactId);

  return {
    ...contact,
    contact_methods: contactMethods.listByContact(contactId),
    addresses: addresses.listByContact(contactId),
    food_preferences: foodPreferences.get(contactId),
    custom_fields: customFields.listByContact(contactId),
    tags: tags.listByContact(contactId),
    relationships: relationships.listByContact(contactId),
    recent_notes: recentNotes.data,
    recent_activities: recentActivities.data,
    life_events: allLifeEvents.data,
    active_reminders: activeReminders,
    open_tasks: openTaskRows,
    recent_gifts: recentGifts.data,
    active_debts: activeDebts.data,
    debt_summary: debtSummary,
  };
}
