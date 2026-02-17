import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { ContactService } from '../services/contacts.js';
import { ContactMethodService } from '../services/contact-methods.js';
import { AddressService } from '../services/addresses.js';
import { FoodPreferencesService } from '../services/food-preferences.js';
import { CustomFieldService } from '../services/custom-fields.js';
import { RelationshipService, getRelationshipTypes } from '../services/relationships.js';
import { NoteService } from '../services/notes.js';
import { TagService } from '../services/tags-groups.js';
import { ActivityService, ActivityTypeService } from '../services/activities.js';
import { LifeEventService } from '../services/life-events.js';
import { TimelineService } from '../services/timeline.js';
import { ReminderService } from '../services/reminders.js';
import { NotificationService } from '../services/notifications.js';
import { GiftService } from '../services/gifts.js';
import { DebtService } from '../services/debts.js';
import { TaskService } from '../services/tasks.js';
import { DataExportService } from '../services/data-export.js';
import { SearchService } from '../services/search.js';
import { registerPrompts } from './prompts.js';

// ─── Helpers ──────────────────────────────────────────────────────

/** Extract the authenticated userId from the tool callback's extra parameter */
function getUserId(extra: { authInfo?: AuthInfo }): string {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

/** Verify that a contact belongs to the authenticated user */
function verifyContactOwnership(db: Database.Database, userId: string, contactId: string): void {
  const contact = db.prepare(
    'SELECT id FROM contacts WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
  ).get(contactId, userId);
  if (!contact) throw new Error('Contact not found');
}

/** Verify that a record's contact belongs to the authenticated user */
function verifyRecordOwnership(db: Database.Database, userId: string, table: string, recordId: string): void {
  const row = db.prepare(
    `SELECT contact_id FROM ${table} WHERE id = ?`
  ).get(recordId) as { contact_id: string } | undefined;
  if (!row) throw new Error('Record not found');
  verifyContactOwnership(db, userId, row.contact_id);
}

/** Verify that a notification belongs to the authenticated user */
function verifyNotificationOwnership(db: Database.Database, userId: string, notificationId: string): void {
  const row = db.prepare(
    'SELECT id FROM notifications WHERE id = ? AND user_id = ?'
  ).get(notificationId, userId);
  if (!row) throw new Error('Notification not found');
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  console.error(`[MCP] Tool error: ${message}`);
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

// ─── Server Factory ───────────────────────────────────────────────

export function createMcpServer(db: Database.Database): McpServer {
  const server = new McpServer({
    name: 'mob-crm',
    version: '0.1.0',
  }, {
    capabilities: {
      prompts: {},
    },
  });

  // Initialize services
  const contacts = new ContactService(db);
  const contactMethods = new ContactMethodService(db);
  const addresses = new AddressService(db);
  const foodPreferences = new FoodPreferencesService(db);
  const customFields = new CustomFieldService(db);
  const relationships = new RelationshipService(db);
  const notes = new NoteService(db);
  const tags = new TagService(db);
  const activityService = new ActivityService(db);
  const activityTypes = new ActivityTypeService(db);
  const lifeEvents = new LifeEventService(db);
  const timeline = new TimelineService(db);
  const reminderService = new ReminderService(db);
  const notificationService = new NotificationService(db);
  const giftService = new GiftService(db);
  const debtService = new DebtService(db);
  const taskService = new TaskService(db);
  const dataExportService = new DataExportService(db);
  const searchService = new SearchService(db);

  // ─── Contact Tools ────────────────────────────────────────────

  server.registerTool('contact_create', {
    description: 'Create a new contact with basic info',
    inputSchema: {
      first_name: z.string().describe('First name (required)'),
      last_name: z.string().optional().describe('Last name'),
      nickname: z.string().optional().describe('Nickname'),
      maiden_name: z.string().optional().describe('Maiden name'),
      gender: z.string().optional().describe('Gender'),
      pronouns: z.string().optional().describe('Pronouns (e.g. she/her, he/him, they/them)'),
      avatar_url: z.string().optional().describe('Avatar URL'),
      birthday_mode: z.enum(['full_date', 'month_day', 'approximate_age']).optional()
        .describe('Birthday mode: full_date (YYYY-MM-DD), month_day (month + day only), or approximate_age (birth year estimate)'),
      birthday_date: z.string().optional().describe('Full birthday date (YYYY-MM-DD), used with birthday_mode=full_date'),
      birthday_month: z.number().optional().describe('Birthday month (1-12), used with birthday_mode=month_day'),
      birthday_day: z.number().optional().describe('Birthday day (1-31), used with birthday_mode=month_day'),
      birthday_year_approximate: z.number().optional().describe('Approximate birth year, used with birthday_mode=approximate_age'),
      status: z.enum(['active', 'archived', 'deceased']).optional().describe('Contact status (default: active)'),
      deceased_date: z.string().optional().describe('Date of death (YYYY-MM-DD)'),
      is_favorite: z.boolean().optional().describe('Mark as favorite'),
      met_at_date: z.string().optional().describe('Date you met this person (YYYY-MM-DD)'),
      met_at_location: z.string().optional().describe('Where you met this person'),
      met_through_contact_id: z.string().optional().describe('Contact ID of person who introduced you'),
      met_description: z.string().optional().describe('Story of how you met'),
      job_title: z.string().optional().describe('Job title'),
      company: z.string().optional().describe('Company or organization'),
      industry: z.string().optional().describe('Industry'),
      work_notes: z.string().optional().describe('Notes about their work'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const contact = contacts.create(userId, args);
      return textResult(contact);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_get', {
    description: 'Get full contact details including all related data in one call: contact methods, addresses, food preferences, custom fields, tags, relationships, recent notes, recent activities, life events, active reminders, open tasks, recent gifts, active debts, and debt summary',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const contact = contacts.get(userId, args.contact_id);
      if (!contact) return errorResult('Contact not found');

      // Enrich with sub-entities
      const recentNotes = notes.listByContact(userId, args.contact_id, { per_page: 10 });
      const recentActivities = activityService.list(userId, { contact_id: args.contact_id, per_page: 10 });
      const allLifeEvents = lifeEvents.listByContact(userId, args.contact_id, { per_page: 1000 });

      // Active reminders (not completed/dismissed) for this contact
      const activeReminderRows = db.prepare(`
        SELECT r.* FROM reminders r
        JOIN contacts c ON r.contact_id = c.id
        WHERE r.contact_id = ? AND r.deleted_at IS NULL AND c.deleted_at IS NULL AND c.user_id = ?
          AND r.status NOT IN ('completed', 'dismissed')
        ORDER BY r.reminder_date ASC
      `).all(args.contact_id, userId) as any[];
      const activeReminders = activeReminderRows.map((r: any) => ({
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
      `).all(args.contact_id, userId) as any[];

      const recentGifts = giftService.list(userId, { contact_id: args.contact_id, per_page: 10 });

      // Active (unsettled) debts for this contact
      const activeDebts = debtService.list(userId, { contact_id: args.contact_id, status: 'active' });

      const debtSummary = debtService.summary(userId, args.contact_id);

      const result = {
        ...contact,
        contact_methods: contactMethods.listByContact(args.contact_id),
        addresses: addresses.listByContact(args.contact_id),
        food_preferences: foodPreferences.get(args.contact_id),
        custom_fields: customFields.listByContact(args.contact_id),
        tags: tags.listByContact(args.contact_id),
        relationships: relationships.listByContact(args.contact_id),
        recent_notes: recentNotes.data,
        recent_activities: recentActivities.data,
        life_events: allLifeEvents.data,
        active_reminders: activeReminders,
        open_tasks: openTaskRows,
        recent_gifts: recentGifts.data,
        active_debts: activeDebts.data,
        debt_summary: debtSummary,
      };

      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_update', {
    description: 'Update contact fields',
    inputSchema: {
      contact_id: z.string().describe('The contact ID to update'),
      first_name: z.string().optional().describe('First name'),
      last_name: z.string().optional().describe('Last name'),
      nickname: z.string().optional().describe('Nickname'),
      maiden_name: z.string().optional().describe('Maiden name'),
      gender: z.string().optional().describe('Gender'),
      pronouns: z.string().optional().describe('Pronouns'),
      avatar_url: z.string().optional().describe('Avatar URL'),
      birthday_mode: z.enum(['full_date', 'month_day', 'approximate_age']).optional().describe('Birthday mode'),
      birthday_date: z.string().optional().describe('Full birthday date (YYYY-MM-DD)'),
      birthday_month: z.number().optional().describe('Birthday month (1-12)'),
      birthday_day: z.number().optional().describe('Birthday day (1-31)'),
      birthday_year_approximate: z.number().optional().describe('Approximate birth year'),
      status: z.enum(['active', 'archived', 'deceased']).optional().describe('Contact status'),
      deceased_date: z.string().optional().describe('Date of death (YYYY-MM-DD)'),
      is_favorite: z.boolean().optional().describe('Mark as favorite'),
      met_at_date: z.string().optional().describe('Date you met this person'),
      met_at_location: z.string().optional().describe('Where you met this person'),
      met_through_contact_id: z.string().optional().describe('Contact ID of person who introduced you'),
      met_description: z.string().optional().describe('How you met'),
      job_title: z.string().optional().describe('Job title'),
      company: z.string().optional().describe('Company'),
      industry: z.string().optional().describe('Industry'),
      work_notes: z.string().optional().describe('Work notes'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const { contact_id, ...updates } = args;
      const contact = contacts.update(userId, contact_id, updates);
      if (!contact) return errorResult('Contact not found');
      return textResult(contact);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_delete', {
    description: 'Soft-delete a contact (can be restored later)',
    inputSchema: {
      contact_id: z.string().describe('The contact ID to delete'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const success = contacts.softDelete(userId, args.contact_id);
      if (!success) return errorResult('Contact not found');
      return textResult({ success: true, message: 'Contact deleted' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_restore', {
    description: 'Restore a soft-deleted contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID to restore'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const contact = contacts.restore(userId, args.contact_id);
      return textResult(contact);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_list', {
    description: 'List contacts with optional filters (status, favorite, company, tag, search). Returns paginated results.',
    inputSchema: {
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
      status: z.enum(['active', 'archived', 'deceased']).optional().describe('Filter by status'),
      is_favorite: z.boolean().optional().describe('Filter by favorite'),
      search: z.string().optional().describe('Search contacts by name, company, or job title'),
      company: z.string().optional().describe('Filter by company'),
      tag_name: z.string().optional().describe('Filter by tag name'),
      sort_by: z.enum(['name', 'created_at', 'updated_at']).optional().describe('Sort field (default: name)'),
      sort_order: z.enum(['asc', 'desc']).optional().describe('Sort order (default: asc)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted contacts in results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = contacts.list(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Contact Merge & Duplicate Detection ─────────────────────

  server.registerTool('contact_merge', {
    description: 'Merge two contacts into one. All child records (notes, activities, tags, etc.) from the secondary contact are moved to the primary. The secondary contact is soft-deleted after merge.',
    inputSchema: {
      primary_contact_id: z.string().describe('The contact ID to keep (primary)'),
      secondary_contact_id: z.string().describe('The contact ID to merge into the primary (will be soft-deleted)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = contacts.merge(userId, args.primary_contact_id, args.secondary_contact_id);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_find_duplicates', {
    description: 'Scan for potential duplicate contacts using name, email, and phone matching. Returns pairs of contacts that may be duplicates with the reason for the match.',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = contacts.findDuplicates(userId);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Contact Method Tools ─────────────────────────────────────

  server.registerTool('contact_method_manage', {
    description: 'Add, update, or remove a contact method (email, phone, social handle, etc.)',
    inputSchema: {
      action: z.enum(['add', 'update', 'remove']).describe('Action to perform'),
      contact_id: z.string().optional().describe('The contact ID (required for "add")'),
      id: z.string().optional().describe('The contact method ID (required for "update" and "remove")'),
      type: z.enum(['email', 'phone', 'whatsapp', 'telegram', 'signal', 'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other'])
        .optional().describe('Type of contact method (required for "add")'),
      value: z.string().optional().describe('The value — email, phone number, handle (required for "add")'),
      label: z.string().optional().describe('Label (e.g. "Personal", "Work")'),
      is_primary: z.boolean().optional().describe('Set as primary for this type'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'add') {
        if (!args.contact_id || !args.type || !args.value) return errorResult('contact_id, type, and value are required for "add"');
        verifyContactOwnership(db, userId, args.contact_id);
        const method = contactMethods.add({ contact_id: args.contact_id, type: args.type, value: args.value, label: args.label, is_primary: args.is_primary });
        return textResult(method);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'contact_methods', args.id);
        const method = contactMethods.update(args.id, { type: args.type, value: args.value, label: args.label, is_primary: args.is_primary });
        if (!method) return errorResult('Contact method not found');
        return textResult(method);
      } else {
        if (!args.id) return errorResult('id is required for "remove"');
        verifyRecordOwnership(db, userId, 'contact_methods', args.id);
        const success = contactMethods.remove(args.id);
        if (!success) return errorResult('Contact method not found');
        return textResult({ success: true, message: 'Contact method removed' });
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Address Tools ────────────────────────────────────────────

  server.registerTool('address_manage', {
    description: 'Add, update, or remove an address for a contact',
    inputSchema: {
      action: z.enum(['add', 'update', 'remove']).describe('Action to perform'),
      contact_id: z.string().optional().describe('The contact ID (required for "add")'),
      id: z.string().optional().describe('The address ID (required for "update" and "remove")'),
      label: z.string().optional().describe('Label (e.g. "Home", "Work")'),
      street_line_1: z.string().optional().describe('Street address line 1'),
      street_line_2: z.string().optional().describe('Street address line 2'),
      city: z.string().optional().describe('City'),
      state_province: z.string().optional().describe('State or province'),
      postal_code: z.string().optional().describe('Postal/ZIP code'),
      country: z.string().optional().describe('Country (ISO 3166-1 alpha-2 recommended)'),
      is_primary: z.boolean().optional().describe('Set as primary address'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'add') {
        if (!args.contact_id) return errorResult('contact_id is required for "add"');
        verifyContactOwnership(db, userId, args.contact_id);
        const address = addresses.add({ contact_id: args.contact_id, label: args.label, street_line_1: args.street_line_1, street_line_2: args.street_line_2, city: args.city, state_province: args.state_province, postal_code: args.postal_code, country: args.country, is_primary: args.is_primary });
        return textResult(address);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'addresses', args.id);
        const { action, contact_id, id, ...updates } = args;
        const address = addresses.update(id, updates);
        if (!address) return errorResult('Address not found');
        return textResult(address);
      } else {
        if (!args.id) return errorResult('id is required for "remove"');
        verifyRecordOwnership(db, userId, 'addresses', args.id);
        const success = addresses.remove(args.id);
        if (!success) return errorResult('Address not found');
        return textResult({ success: true, message: 'Address removed' });
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Food Preferences Tools ───────────────────────────────────

  server.registerTool('food_preferences_get', {
    description: 'Get food preferences for a contact (dietary restrictions, allergies, favorites, dislikes)',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      verifyContactOwnership(db, userId, args.contact_id);
      const prefs = foodPreferences.get(args.contact_id);
      if (!prefs) return textResult({ message: 'No food preferences recorded for this contact' });
      return textResult(prefs);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('food_preferences_upsert', {
    description: 'Set or update food preferences for a contact. Replaces all fields — pass all known preferences, not just changes.',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      dietary_restrictions: z.array(z.string()).optional().describe('Dietary restrictions (e.g. ["vegetarian", "gluten-free"])'),
      allergies: z.array(z.string()).optional().describe('Food allergies (e.g. ["peanuts", "shellfish"])'),
      favorite_foods: z.array(z.string()).optional().describe('Favorite foods'),
      disliked_foods: z.array(z.string()).optional().describe('Disliked foods'),
      notes: z.string().optional().describe('Additional notes about food preferences'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      verifyContactOwnership(db, userId, args.contact_id);
      const prefs = foodPreferences.upsert(args);
      return textResult(prefs);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Custom Field Tools ───────────────────────────────────────

  server.registerTool('custom_field_manage', {
    description: 'Add, update, or remove a custom field on a contact',
    inputSchema: {
      action: z.enum(['add', 'update', 'remove']).describe('Action to perform'),
      contact_id: z.string().optional().describe('The contact ID (required for "add")'),
      id: z.string().optional().describe('The custom field ID (required for "update" and "remove")'),
      field_name: z.string().optional().describe('Field name, e.g. "Favorite Color" (required for "add")'),
      field_value: z.string().optional().describe('Field value (required for "add")'),
      field_group: z.string().optional().describe('Group to organize fields, e.g. "Preferences"'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'add') {
        if (!args.contact_id || !args.field_name || !args.field_value) return errorResult('contact_id, field_name, and field_value are required for "add"');
        verifyContactOwnership(db, userId, args.contact_id);
        const field = customFields.add({ contact_id: args.contact_id, field_name: args.field_name, field_value: args.field_value, field_group: args.field_group });
        return textResult(field);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'custom_fields', args.id);
        const field = customFields.update(args.id, { field_name: args.field_name, field_value: args.field_value, field_group: args.field_group });
        if (!field) return errorResult('Custom field not found');
        return textResult(field);
      } else {
        if (!args.id) return errorResult('id is required for "remove"');
        verifyRecordOwnership(db, userId, 'custom_fields', args.id);
        const success = customFields.remove(args.id);
        if (!success) return errorResult('Custom field not found');
        return textResult({ success: true, message: 'Custom field removed' });
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Relationship Tools ─────────────────────────────────────

  const relationshipTypeEnum = z.enum(getRelationshipTypes() as [string, ...string[]]);

  server.registerTool('relationship_manage', {
    description: 'Add, update, remove, or list relationships between contacts.\n' +
      '• action="add": Create a relationship between two contacts. Automatically creates the inverse relationship. ' +
      'Requires contact_id, related_contact_id, and relationship_type. ' +
      'To create relationships involving yourself, use your own contact_id from the prime tool. ' +
      'Relationships describe how contacts relate to each other (e.g. Bandit is Bingo\'s parent).\n' +
      '• action="update": Update a relationship. Also updates the inverse relationship. Requires id. Optionally set relationship_type and/or notes.\n' +
      '• action="remove": Remove a relationship and its inverse. Requires id.\n' +
      '• action="list": List all relationships for a contact. Requires contact_id.',
    inputSchema: {
      action: z.enum(['add', 'update', 'remove', 'list']).describe('Action to perform'),
      contact_id: z.string().optional().describe('The source contact ID (required for "add" and "list")'),
      related_contact_id: z.string().optional().describe('The related contact ID (required for "add")'),
      id: z.string().optional().describe('The relationship ID (required for "update" and "remove")'),
      relationship_type: relationshipTypeEnum.optional().describe('Type of relationship (required for "add", optional for "update")'),
      notes: z.string().optional().describe('Notes about this relationship (optional for "add" and "update")'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'add') {
        if (!args.contact_id || !args.related_contact_id || !args.relationship_type) return errorResult('contact_id, related_contact_id, and relationship_type are required for "add"');
        verifyContactOwnership(db, userId, args.contact_id);
        verifyContactOwnership(db, userId, args.related_contact_id);
        const rel = relationships.add({ contact_id: args.contact_id, related_contact_id: args.related_contact_id, relationship_type: args.relationship_type, notes: args.notes });
        return textResult(rel);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'relationships', args.id);
        const { action, contact_id, related_contact_id, id, ...updates } = args;
        const rel = relationships.update(id, updates);
        if (!rel) return errorResult('Relationship not found');
        return textResult(rel);
      } else if (args.action === 'remove') {
        if (!args.id) return errorResult('id is required for "remove"');
        verifyRecordOwnership(db, userId, 'relationships', args.id);
        const success = relationships.remove(args.id);
        if (!success) return errorResult('Relationship not found');
        return textResult({ success: true, message: 'Relationship removed' });
      } else {
        if (!args.contact_id) return errorResult('contact_id is required for "list"');
        verifyContactOwnership(db, userId, args.contact_id);
        const rels = relationships.listByContact(args.contact_id);
        return textResult(rels);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Note Tools ───────────────────────────────────────────────

  server.registerTool('note_manage', {
    description: 'Create, update, delete, or restore a note for a contact.\n' +
      '• action="create": Add a new note. Requires contact_id and body. Optional title, is_pinned.\n' +
      '• action="update": Update an existing note. Requires id. Optional title, body, is_pinned.\n' +
      '• action="delete": Soft-delete a note. Requires id.\n' +
      '• action="restore": Restore a soft-deleted note. Requires id.',
    inputSchema: {
      action: z.enum(['create', 'update', 'delete', 'restore']).describe('Action to perform'),
      contact_id: z.string().optional().describe('The contact ID (required for "create")'),
      id: z.string().optional().describe('The note ID (required for "update", "delete", "restore")'),
      title: z.string().optional().describe('Note title (optional for "create" and "update")'),
      body: z.string().optional().describe('Note body, supports markdown (required for "create", optional for "update")'),
      is_pinned: z.boolean().optional().describe('Pin/unpin note (optional for "create" and "update")'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'create') {
        if (!args.contact_id || !args.body) return errorResult('contact_id and body are required for "create"');
        verifyContactOwnership(db, userId, args.contact_id);
        const note = notes.create(userId, { contact_id: args.contact_id, body: args.body, title: args.title, is_pinned: args.is_pinned });
        return textResult(note);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'notes', args.id);
        const { action, contact_id, id, ...updates } = args;
        const note = notes.update(userId, id, updates);
        if (!note) return errorResult('Note not found');
        return textResult(note);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        verifyRecordOwnership(db, userId, 'notes', args.id);
        const success = notes.softDelete(userId, args.id);
        if (!success) return errorResult('Note not found');
        return textResult({ success: true, message: 'Note deleted' });
      } else {
        // restore
        if (!args.id) return errorResult('id is required for "restore"');
        const note = notes.restore(userId, args.id);
        return textResult(note);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('note_list', {
    description: 'List and search notes. When contact_id is provided alone, lists that contact\'s notes (pinned first). ' +
      'Add query, tag_name, is_pinned, or omit contact_id to search across all contacts.',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID (optional — omit to search across all contacts)'),
      query: z.string().optional().describe('Search term matched against note title and body'),
      tag_name: z.string().optional().describe('Filter to notes belonging to contacts with this tag'),
      is_pinned: z.boolean().optional().describe('Filter by pinned status'),
      sort_by: z.enum(['created_at', 'updated_at']).optional().describe('Sort field (default: updated_at)'),
      sort_order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted notes in results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      // If only contact_id is provided with no search params, use the simpler listByContact
      const hasSearchParams = args.query || args.tag_name || args.is_pinned !== undefined || args.sort_by || args.sort_order;
      if (args.contact_id && !hasSearchParams) {
        verifyContactOwnership(db, userId, args.contact_id);
        const { contact_id, ...options } = args;
        const result = notes.listByContact(userId, contact_id, options);
        return textResult(result);
      }
      // Otherwise, use searchNotes which supports cross-contact search
      if (args.contact_id) {
        verifyContactOwnership(db, userId, args.contact_id);
      }
      const result = notes.searchNotes(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Tag Tools ────────────────────────────────────────────────

  server.registerTool('tag_manage', {
    description: 'Manage tags and contact tagging.\n' +
      '• action="list": List all tags for the authenticated user. No additional fields required.\n' +
      '• action="create": Create a new tag (or return existing if name already exists). Requires name. Optional color.\n' +
      '• action="update": Update a tag name or color. Requires id. Optional name and color.\n' +
      '• action="delete": Delete a tag. Requires id.\n' +
      '• action="tag_contact": Tag a contact. Creates the tag if it doesn\'t exist. Requires name (the tag name) and contact_id. Optional color (only used if creating new tag).\n' +
      '• action="untag_contact": Remove a tag from a contact. Requires id (the tag ID) and contact_id.',
    inputSchema: {
      action: z.enum(['list', 'create', 'update', 'delete', 'tag_contact', 'untag_contact']).describe('Action to perform'),
      id: z.string().optional().describe('The tag ID (required for update, delete, untag_contact)'),
      name: z.string().optional().describe('Tag name (required for create and tag_contact)'),
      color: z.string().optional().describe('Tag color hex code (optional for create, update, tag_contact)'),
      contact_id: z.string().optional().describe('The contact ID (required for tag_contact and untag_contact)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'list') {
        const result = tags.list(userId);
        return textResult(result);
      } else if (args.action === 'create') {
        if (!args.name) return errorResult('name is required for "create"');
        const tag = tags.create(userId, args.name, args.color);
        return textResult(tag);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        const tag = tags.update(userId, args.id, { name: args.name, color: args.color });
        if (!tag) return errorResult('Tag not found');
        return textResult(tag);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        const success = tags.delete(userId, args.id);
        if (!success) return errorResult('Tag not found');
        return textResult({ success: true, message: 'Tag deleted' });
      } else if (args.action === 'tag_contact') {
        if (!args.name || !args.contact_id) return errorResult('name and contact_id are required for "tag_contact"');
        const tag = tags.tagContact(userId, args.contact_id, args.name, args.color);
        return textResult(tag);
      } else {
        // untag_contact
        if (!args.id || !args.contact_id) return errorResult('id and contact_id are required for "untag_contact"');
        verifyContactOwnership(db, userId, args.contact_id);
        const success = tags.untagContact(args.contact_id, args.id);
        if (!success) return errorResult('Tag not found on this contact');
        return textResult({ success: true, message: 'Tag removed from contact' });
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Activity Tools ────────────────────────────────────────────

  server.registerTool('activity_manage', {
    description: 'Create, get, update, delete, or restore an activity/interaction.\n' +
      '• action="create": Record a new activity. Requires type, occurred_at, participant_contact_ids. Optional title, description, duration_minutes, location, activity_type_id.\n' +
      '• action="get": Get full details of an activity. Requires id.\n' +
      '• action="update": Update an activity. Requires id. Optional type, title, description, occurred_at, duration_minutes, location, participant_contact_ids.\n' +
      '• action="delete": Soft-delete an activity. Requires id.\n' +
      '• action="restore": Restore a soft-deleted activity. Requires id.',
    inputSchema: {
      action: z.enum(['create', 'get', 'update', 'delete', 'restore']).describe('Action to perform'),
      id: z.string().optional().describe('The activity ID (required for "get", "update", "delete", "restore")'),
      type: z.enum(['phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other'])
        .optional().describe('Type of interaction (required for "create", optional for "update")'),
      title: z.string().optional().describe('Title (e.g. "Coffee at Blue Bottle")'),
      description: z.string().optional().describe('Description or notes'),
      occurred_at: z.string().optional().describe('When it happened (ISO date/datetime) (required for "create", optional for "update")'),
      duration_minutes: z.number().optional().describe('Duration in minutes'),
      location: z.string().optional().describe('Where it happened'),
      activity_type_id: z.string().optional().describe('Custom activity type ID'),
      participant_contact_ids: z.array(z.string()).optional().describe('Contact IDs of participants (required for "create", optional for "update")'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'create') {
        if (!args.type || !args.occurred_at || !args.participant_contact_ids) return errorResult('type, occurred_at, and participant_contact_ids are required for "create"');
        const activity = activityService.create(userId, {
          type: args.type,
          title: args.title,
          description: args.description,
          occurred_at: args.occurred_at,
          duration_minutes: args.duration_minutes,
          location: args.location,
          activity_type_id: args.activity_type_id,
          participant_contact_ids: args.participant_contact_ids,
        });
        return textResult(activity);
      } else if (args.action === 'get') {
        if (!args.id) return errorResult('id is required for "get"');
        const activity = activityService.get(userId, args.id);
        if (!activity) return errorResult('Activity not found');
        return textResult(activity);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        const { action, id, activity_type_id, ...updates } = args;
        const activity = activityService.update(userId, id, updates);
        if (!activity) return errorResult('Activity not found');
        return textResult(activity);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        const success = activityService.softDelete(userId, args.id);
        if (!success) return errorResult('Activity not found');
        return textResult({ success: true, message: 'Activity deleted' });
      } else {
        // restore
        if (!args.id) return errorResult('id is required for "restore"');
        const activity = activityService.restore(userId, args.id);
        return textResult(activity);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('activity_list', {
    description: 'List activities, optionally filtered by contact or type. ' +
      'Add days_back or since for a chronological activity journal with participant names.',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID'),
      type: z.enum(['phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other'])
        .optional().describe('Filter by interaction type'),
      days_back: z.number().min(1).max(365).optional()
        .describe('Look-back window in days (uses activity log mode with participant names). Ignored if since is provided.'),
      since: z.string().optional()
        .describe('Show activities since this ISO date (uses activity log mode with participant names)'),
      sort_order: z.enum(['asc', 'desc']).optional().describe('Sort direction by occurred_at (default: desc, only for activity log mode)'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted activities in results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      // If days_back or since is provided, use the richer activity log mode
      if (args.days_back || args.since) {
        const result = activityService.getActivityLog(userId, args);
        return textResult(result);
      }
      const result = activityService.list(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });


  server.registerTool('activity_type_manage', {
    description: 'List, create, update, or delete custom activity types',
    inputSchema: {
      action: z.enum(['list', 'create', 'update', 'delete']).describe('Action to perform'),
      id: z.string().optional().describe('Activity type ID (required for "update" and "delete")'),
      name: z.string().optional().describe('Activity type name (required for "create")'),
      category: z.string().optional().describe('Category (e.g. "Food & Drink", "Sports")'),
      icon: z.string().optional().describe('Icon identifier'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'list') {
        const result = activityTypes.list(userId);
        return textResult(result);
      } else if (args.action === 'create') {
        if (!args.name) return errorResult('name is required for "create"');
        const type = activityTypes.create(userId, args.name, args.category, args.icon);
        return textResult(type);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        const { action, id, ...input } = args;
        const type = activityTypes.update(userId, id, input);
        if (!type) return errorResult('Activity type not found');
        return textResult(type);
      } else {
        if (!args.id) return errorResult('id is required for "delete"');
        const result = activityTypes.delete(userId, args.id);
        if (!result.deleted) return errorResult('Activity type not found');
        return textResult(result);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Life Event Tools ─────────────────────────────────────────

  server.registerTool('life_event_manage', {
    description: 'Create, list, update, delete, or restore life events for a contact.\n' +
      '• action="create": Record a new life event. Requires contact_id, event_type, and title. Optional description, occurred_at, related_contact_ids.\n' +
      '• action="list": List life events for a contact. Requires contact_id. Optional page, per_page, include_deleted.\n' +
      '• action="update": Update a life event. Requires id. Optional event_type, title, description, occurred_at, related_contact_ids.\n' +
      '• action="delete": Soft-delete a life event. Requires id.\n' +
      '• action="restore": Restore a soft-deleted life event. Requires id.',
    inputSchema: {
      action: z.enum(['create', 'list', 'update', 'delete', 'restore']).describe('Action to perform'),
      contact_id: z.string().optional().describe('The contact ID (required for "create" and "list")'),
      id: z.string().optional().describe('The life event ID (required for "update", "delete", "restore")'),
      event_type: z.string().optional().describe('Event type (e.g. "new_job", "got_married", "moved") — required for "create", optional for "update"'),
      title: z.string().optional().describe('Title (e.g. "Started at Google", "Moved to Berlin") — required for "create", optional for "update"'),
      description: z.string().optional().describe('Description (optional for "create" and "update")'),
      occurred_at: z.string().optional().describe('When it happened (ISO date, optional for "create" and "update")'),
      related_contact_ids: z.array(z.string()).optional().describe('IDs of other contacts involved (optional for "create" and "update")'),
      page: z.number().optional().describe('Page number for "list" (default: 1)'),
      per_page: z.number().optional().describe('Results per page for "list" (default: 20)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted life events in "list" results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'create') {
        if (!args.contact_id || !args.event_type || !args.title) return errorResult('contact_id, event_type, and title are required for "create"');
        verifyContactOwnership(db, userId, args.contact_id);
        if (args.related_contact_ids) {
          for (const relId of args.related_contact_ids) {
            verifyContactOwnership(db, userId, relId);
          }
        }
        const event = lifeEvents.create(userId, { contact_id: args.contact_id, event_type: args.event_type, title: args.title, description: args.description, occurred_at: args.occurred_at, related_contact_ids: args.related_contact_ids });
        return textResult(event);
      } else if (args.action === 'list') {
        if (!args.contact_id) return errorResult('contact_id is required for "list"');
        verifyContactOwnership(db, userId, args.contact_id);
        const result = lifeEvents.listByContact(userId, args.contact_id, { page: args.page, per_page: args.per_page, include_deleted: args.include_deleted });
        return textResult(result);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'life_events', args.id);
        if (args.related_contact_ids) {
          for (const relId of args.related_contact_ids) {
            verifyContactOwnership(db, userId, relId);
          }
        }
        const { action, contact_id, id, page, per_page, include_deleted, ...updates } = args;
        const event = lifeEvents.update(userId, id, updates);
        if (!event) return errorResult('Life event not found');
        return textResult(event);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        verifyRecordOwnership(db, userId, 'life_events', args.id);
        const success = lifeEvents.softDelete(userId, args.id);
        if (!success) return errorResult('Life event not found');
        return textResult({ success: true, message: 'Life event deleted' });
      } else {
        // restore
        if (!args.id) return errorResult('id is required for "restore"');
        const event = lifeEvents.restore(userId, args.id);
        return textResult(event);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Timeline Tool ────────────────────────────────────────────

  server.registerTool('contact_timeline', {
    description: 'Get the unified timeline for a contact (activities, life events, notes, etc.)',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      entry_type: z.enum(['activity', 'life_event', 'note', 'contact_created']).optional()
        .describe('Filter by entry type'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      verifyContactOwnership(db, userId, args.contact_id);
      const { contact_id, ...options } = args;
      const result = timeline.getTimeline(contact_id, options);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Reminder Tools ──────────────────────────────────────────

  server.registerTool('reminder_manage', {
    description: 'Create, list, update, complete, snooze, delete, or restore reminders.\n' +
      '• action="create": Create a reminder for a contact. Requires contact_id, title, and reminder_date. Optional description, frequency.\n' +
      '• action="list": List reminders, optionally filtered by contact or status. Optional contact_id, status, page, per_page, include_deleted.\n' +
      '• action="update": Update a reminder. Requires id. Optional title, description, reminder_date, frequency.\n' +
      '• action="complete": Mark a reminder as completed. For recurring reminders, advances to the next occurrence. Requires id.\n' +
      '• action="snooze": Snooze a reminder to a new date. Requires id and new_date.\n' +
      '• action="delete": Soft-delete a reminder. Requires id.\n' +
      '• action="restore": Restore a soft-deleted reminder. Requires id.',
    inputSchema: {
      action: z.enum(['create', 'list', 'update', 'complete', 'snooze', 'delete', 'restore']).describe('Action to perform'),
      id: z.string().optional().describe('The reminder ID (required for "update", "complete", "snooze", "delete", "restore")'),
      contact_id: z.string().optional().describe('The contact ID (required for "create", optional filter for "list")'),
      title: z.string().optional().describe('Reminder title (required for "create", optional for "update")'),
      description: z.string().optional().describe('Description (optional for "create" and "update")'),
      reminder_date: z.string().optional().describe('When to remind (ISO date YYYY-MM-DD) (required for "create", optional for "update")'),
      frequency: z.enum(['one_time', 'weekly', 'monthly', 'yearly']).optional().describe('Frequency (default: one_time, optional for "create" and "update")'),
      new_date: z.string().optional().describe('New reminder date (ISO date YYYY-MM-DD) (required for "snooze")'),
      status: z.enum(['active', 'snoozed', 'completed', 'dismissed']).optional().describe('Filter by status (for "list" only)'),
      page: z.number().optional().describe('Page number for "list" (default: 1)'),
      per_page: z.number().optional().describe('Results per page for "list" (default: 20)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted reminders in "list" results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'create') {
        if (!args.contact_id || !args.title || !args.reminder_date) return errorResult('contact_id, title, and reminder_date are required for "create"');
        verifyContactOwnership(db, userId, args.contact_id);
        const reminder = reminderService.create(userId, { contact_id: args.contact_id, title: args.title, description: args.description, reminder_date: args.reminder_date, frequency: args.frequency });
        return textResult(reminder);
      } else if (args.action === 'list') {
        if (args.contact_id) {
          verifyContactOwnership(db, userId, args.contact_id);
        }
        // Scope to user's contacts
        const page = args.page ?? 1;
        const perPage = args.per_page ?? 20;
        const offset = (page - 1) * perPage;
        const conditions: string[] = ['c.deleted_at IS NULL', 'c.user_id = ?'];
        const params: any[] = [userId];
        if (!args.include_deleted) { conditions.push('r.deleted_at IS NULL'); }
        if (args.contact_id) { conditions.push('r.contact_id = ?'); params.push(args.contact_id); }
        if (args.status) { conditions.push('r.status = ?'); params.push(args.status); }
        const whereClause = conditions.join(' AND ');
        const countResult = db.prepare(
          `SELECT COUNT(*) as count FROM reminders r JOIN contacts c ON r.contact_id = c.id WHERE ${whereClause}`
        ).get(...params) as any;
        const rows = db.prepare(
          `SELECT r.* FROM reminders r JOIN contacts c ON r.contact_id = c.id WHERE ${whereClause} ORDER BY r.reminder_date ASC LIMIT ? OFFSET ?`
        ).all(...params, perPage, offset) as any[];
        const data = rows.map((r: any) => ({ ...r, is_auto_generated: Boolean(r.is_auto_generated) }));
        return textResult({ data, total: countResult.count, page, per_page: perPage });
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'reminders', args.id);
        const { action, id, contact_id, new_date, status, page, per_page, include_deleted, ...updates } = args;
        const reminder = reminderService.update(userId, id, updates);
        if (!reminder) return errorResult('Reminder not found');
        return textResult(reminder);
      } else if (args.action === 'complete') {
        if (!args.id) return errorResult('id is required for "complete"');
        verifyRecordOwnership(db, userId, 'reminders', args.id);
        const reminder = reminderService.complete(userId, args.id);
        if (!reminder) return errorResult('Reminder not found');
        return textResult(reminder);
      } else if (args.action === 'snooze') {
        if (!args.id || !args.new_date) return errorResult('id and new_date are required for "snooze"');
        verifyRecordOwnership(db, userId, 'reminders', args.id);
        const reminder = reminderService.snooze(userId, args.id, args.new_date);
        if (!reminder) return errorResult('Reminder not found');
        return textResult(reminder);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        verifyRecordOwnership(db, userId, 'reminders', args.id);
        const success = reminderService.softDelete(userId, args.id);
        if (!success) return errorResult('Reminder not found');
        return textResult({ success: true, message: 'Reminder deleted' });
      } else {
        // restore
        if (!args.id) return errorResult('id is required for "restore"');
        const reminder = reminderService.restore(userId, args.id);
        return textResult(reminder);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Notification Tools ────────────────────────────────────────

  server.registerTool('notification_list', {
    description: 'List notifications (newest first)',
    inputSchema: {
      unread_only: z.boolean().optional().describe('Only show unread notifications'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = notificationService.list(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('notification_create', {
    description: 'Create a custom notification',
    inputSchema: {
      type: z.enum(['birthday', 'reminder', 'follow_up', 'custom']).describe('Notification type'),
      title: z.string().describe('Notification title'),
      body: z.string().optional().describe('Notification body'),
      contact_id: z.string().optional().describe('Related contact ID'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const notification = notificationService.create(userId, args);
      return textResult(notification);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('notification_read', {
    description: 'Mark notification(s) as read. Pass id for a single notification, or all=true for all.',
    inputSchema: {
      id: z.string().optional().describe('The notification ID (required unless all=true)'),
      all: z.boolean().optional().describe('Mark all notifications as read (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.all) {
        const count = notificationService.markAllRead(userId);
        return textResult({ success: true, message: `${count} notifications marked as read` });
      }
      if (!args.id) return errorResult('id is required (or set all=true)');
      verifyNotificationOwnership(db, userId, args.id);
      const success = notificationService.markRead(args.id);
      if (!success) return errorResult('Notification not found or already read');
      return textResult({ success: true, message: 'Notification marked as read' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Gift Tools ────────────────────────────────────────────────

  server.registerTool('gift_manage', {
    description: 'Create, update, delete, or restore a gift for a contact.\n' +
      '• action="create": Track a gift idea, plan, or record a given/received gift. Requires contact_id, name, and direction. Optional description, url, estimated_cost, currency, occasion, status, date.\n' +
      '• action="update": Update an existing gift (change status, add details, etc.). Requires id. Optional name, description, url, estimated_cost, currency, occasion, status, direction, date.\n' +
      '• action="delete": Soft-delete a gift. Requires id.\n' +
      '• action="restore": Restore a soft-deleted gift. Requires id.',
    inputSchema: {
      action: z.enum(['create', 'update', 'delete', 'restore']).describe('Action to perform'),
      contact_id: z.string().optional().describe('The contact ID (required for "create")'),
      id: z.string().optional().describe('The gift ID (required for "update", "delete", "restore")'),
      name: z.string().optional().describe('Gift name (required for "create")'),
      description: z.string().optional().describe('Description'),
      url: z.string().optional().describe('Link to the gift'),
      estimated_cost: z.number().optional().describe('Estimated cost'),
      currency: z.string().optional().describe('Currency (default: USD)'),
      occasion: z.string().optional().describe('Occasion (e.g. "Birthday", "Christmas")'),
      status: z.enum(['idea', 'planned', 'purchased', 'given', 'received']).optional()
        .describe('Gift status (default: idea)'),
      direction: z.enum(['giving', 'receiving']).optional().describe('Giving to or receiving from this contact (required for "create")'),
      date: z.string().optional().describe('Date of giving/receiving (ISO date)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'create') {
        if (!args.contact_id || !args.name || !args.direction) return errorResult('contact_id, name, and direction are required for "create"');
        verifyContactOwnership(db, userId, args.contact_id);
        const { action, id, ...createData } = args;
        const gift = giftService.create(userId, createData as any);
        return textResult(gift);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'gifts', args.id);
        const { action, contact_id, id, ...updates } = args;
        const gift = giftService.update(userId, id, updates);
        if (!gift) return errorResult('Gift not found');
        return textResult(gift);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        verifyRecordOwnership(db, userId, 'gifts', args.id);
        const success = giftService.softDelete(userId, args.id);
        if (!success) return errorResult('Gift not found');
        return textResult({ success: true, message: 'Gift deleted' });
      } else {
        // restore
        if (!args.id) return errorResult('id is required for "restore"');
        const gift = giftService.restore(userId, args.id);
        return textResult(gift);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('gift_list', {
    description: 'List gifts, optionally filtered by contact, status, or direction. ' +
      'Add occasion, sort_by, sort_order, or omit contact_id for a cross-contact gift tracker with summary stats.',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID'),
      status: z.enum(['idea', 'planned', 'purchased', 'given', 'received']).optional().describe('Filter by status'),
      direction: z.enum(['giving', 'receiving']).optional().describe('Filter by direction'),
      occasion: z.string().optional().describe('Filter by occasion (fuzzy match, e.g. "birthday", "Christmas")'),
      sort_by: z.enum(['date', 'created_at', 'estimated_cost']).optional()
        .describe('Sort field (default: date for tracker mode, created_at otherwise)'),
      sort_order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted gifts in results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.contact_id) {
        verifyContactOwnership(db, userId, args.contact_id);
      }
      // If occasion, sort_by, sort_order are provided, or no contact_id, use the richer gift tracker mode
      const hasTrackerParams = args.occasion || args.sort_by || args.sort_order || !args.contact_id;
      if (hasTrackerParams) {
        const result = giftService.getGiftTracker(userId, args);
        return textResult(result);
      }
      // Simple list mode scoped to a contact
      const page = args.page ?? 1;
      const perPage = args.per_page ?? 20;
      const offset = (page - 1) * perPage;
      const conditions: string[] = ['g.deleted_at IS NULL', 'c.deleted_at IS NULL', 'c.user_id = ?'];
      const params: any[] = [userId];
      if (args.contact_id) { conditions.push('g.contact_id = ?'); params.push(args.contact_id); }
      if (args.status) { conditions.push('g.status = ?'); params.push(args.status); }
      if (args.direction) { conditions.push('g.direction = ?'); params.push(args.direction); }
      const whereClause = conditions.join(' AND ');
      const countResult = db.prepare(
        `SELECT COUNT(*) as count FROM gifts g JOIN contacts c ON g.contact_id = c.id WHERE ${whereClause}`
      ).get(...params) as any;
      const rows = db.prepare(
        `SELECT g.* FROM gifts g JOIN contacts c ON g.contact_id = c.id WHERE ${whereClause} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`
      ).all(...params, perPage, offset) as any[];
      return textResult({ data: rows, total: countResult.count, page, per_page: perPage });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Debt Tools ────────────────────────────────────────────────

  server.registerTool('debt_manage', {
    description: 'Create, list, update, settle, delete, restore, or summarize debts.\n' +
      '• action="create": Track a new debt. Requires contact_id, amount, direction. Optional currency, reason, incurred_at.\n' +
      '• action="list": List debts. Optional contact_id, status, page, per_page, include_deleted.\n' +
      '• action="update": Update a debt. Requires id. Optional amount, currency, direction, reason, incurred_at.\n' +
      '• action="settle": Mark a debt as settled. Requires id.\n' +
      '• action="delete": Soft-delete a debt. Requires id.\n' +
      '• action="restore": Restore a soft-deleted debt. Requires id.\n' +
      '• action="summary": Get net balance summary for a contact. Requires contact_id.',
    inputSchema: {
      action: z.enum(['create', 'list', 'update', 'settle', 'delete', 'restore', 'summary']).describe('Action to perform'),
      id: z.string().optional().describe('The debt ID (required for "update", "settle", "delete", "restore")'),
      contact_id: z.string().optional().describe('The contact ID (required for "create" and "summary", optional filter for "list")'),
      amount: z.number().optional().describe('Amount owed (required for "create", optional for "update")'),
      currency: z.string().optional().describe('Currency (default: USD)'),
      direction: z.enum(['i_owe_them', 'they_owe_me']).optional().describe('Who owes whom (required for "create", optional for "update")'),
      reason: z.string().optional().describe('Reason for the debt'),
      incurred_at: z.string().optional().describe('When the debt was incurred (ISO date)'),
      status: z.enum(['active', 'settled']).optional().describe('Filter by status (for "list" only)'),
      page: z.number().optional().describe('Page number for "list" (default: 1)'),
      per_page: z.number().optional().describe('Results per page for "list" (default: 20)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted debts in "list" results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'create') {
        if (!args.contact_id || !args.amount || !args.direction) return errorResult('contact_id, amount, and direction are required for "create"');
        verifyContactOwnership(db, userId, args.contact_id);
        const debt = debtService.create(userId, { contact_id: args.contact_id, amount: args.amount, direction: args.direction, currency: args.currency, reason: args.reason, incurred_at: args.incurred_at });
        return textResult(debt);
      } else if (args.action === 'list') {
        if (args.contact_id) {
          verifyContactOwnership(db, userId, args.contact_id);
        }
        // Scope to user's contacts
        const page = args.page ?? 1;
        const perPage = args.per_page ?? 20;
        const offset = (page - 1) * perPage;
        const conditions: string[] = ['c.deleted_at IS NULL', 'c.user_id = ?'];
        const params: any[] = [userId];
        if (!args.include_deleted) { conditions.push('d.deleted_at IS NULL'); }
        if (args.contact_id) { conditions.push('d.contact_id = ?'); params.push(args.contact_id); }
        if (args.status) { conditions.push('d.status = ?'); params.push(args.status); }
        const whereClause = conditions.join(' AND ');
        const countResult = db.prepare(
          `SELECT COUNT(*) as count FROM debts d JOIN contacts c ON d.contact_id = c.id WHERE ${whereClause}`
        ).get(...params) as any;
        const rows = db.prepare(
          `SELECT d.* FROM debts d JOIN contacts c ON d.contact_id = c.id WHERE ${whereClause} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`
        ).all(...params, perPage, offset) as any[];
        return textResult({ data: rows, total: countResult.count, page, per_page: perPage });
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        verifyRecordOwnership(db, userId, 'debts', args.id);
        const { action, id, contact_id, page, per_page, include_deleted, status, ...updates } = args;
        const debt = debtService.update(userId, id, updates);
        if (!debt) return errorResult('Debt not found');
        return textResult(debt);
      } else if (args.action === 'settle') {
        if (!args.id) return errorResult('id is required for "settle"');
        verifyRecordOwnership(db, userId, 'debts', args.id);
        const debt = debtService.settle(userId, args.id);
        if (!debt) return errorResult('Debt not found');
        return textResult(debt);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        verifyRecordOwnership(db, userId, 'debts', args.id);
        const success = debtService.softDelete(userId, args.id);
        if (!success) return errorResult('Debt not found');
        return textResult({ success: true, message: 'Debt deleted' });
      } else if (args.action === 'restore') {
        if (!args.id) return errorResult('id is required for "restore"');
        const debt = debtService.restore(userId, args.id);
        return textResult(debt);
      } else {
        // summary
        if (!args.contact_id) return errorResult('contact_id is required for "summary"');
        verifyContactOwnership(db, userId, args.contact_id);
        const summary = debtService.summary(userId, args.contact_id);
        return textResult(summary);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Task Tools ────────────────────────────────────────────────

  server.registerTool('task_manage', {
    description: 'Create, list, update, complete, delete, or restore tasks.\n' +
      '• action="create": Create a task. Requires title. Optional description, contact_id, due_date, priority.\n' +
      '• action="list": List tasks. Optional contact_id, status, priority, page, per_page, include_deleted.\n' +
      '• action="update": Update a task. Requires id. Optional title, description, contact_id, due_date, priority, status.\n' +
      '• action="complete": Mark a task as completed. Requires id.\n' +
      '• action="delete": Soft-delete a task. Requires id.\n' +
      '• action="restore": Restore a soft-deleted task. Requires id.',
    inputSchema: {
      action: z.enum(['create', 'list', 'update', 'complete', 'delete', 'restore']).describe('Action to perform'),
      id: z.string().optional().describe('The task ID (required for "update", "complete", "delete", "restore")'),
      title: z.string().optional().describe('Task title (required for "create", optional for "update")'),
      description: z.string().optional().describe('Description (optional for "create" and "update")'),
      contact_id: z.string().optional().describe('Link to a contact (optional for "create"/"update", filter for "list")'),
      due_date: z.string().optional().describe('Due date (ISO date, optional for "create" and "update")'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority (optional for "create"/"update", filter for "list")'),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Status (optional for "update", filter for "list")'),
      page: z.number().optional().describe('Page number for "list" (default: 1)'),
      per_page: z.number().optional().describe('Results per page for "list" (default: 20)'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted tasks in "list" results (default: false)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      if (args.action === 'create') {
        if (!args.title) return errorResult('title is required for "create"');
        const task = taskService.create(userId, { title: args.title, description: args.description, contact_id: args.contact_id, due_date: args.due_date, priority: args.priority });
        return textResult(task);
      } else if (args.action === 'list') {
        const result = taskService.list(userId, { contact_id: args.contact_id, status: args.status, priority: args.priority, page: args.page, per_page: args.per_page, include_deleted: args.include_deleted });
        return textResult(result);
      } else if (args.action === 'update') {
        if (!args.id) return errorResult('id is required for "update"');
        const { action, id, page, per_page, include_deleted, ...updates } = args;
        const task = taskService.update(userId, id, updates);
        if (!task) return errorResult('Task not found');
        return textResult(task);
      } else if (args.action === 'complete') {
        if (!args.id) return errorResult('id is required for "complete"');
        const task = taskService.complete(userId, args.id);
        if (!task) return errorResult('Task not found');
        return textResult(task);
      } else if (args.action === 'delete') {
        if (!args.id) return errorResult('id is required for "delete"');
        const success = taskService.softDelete(userId, args.id);
        if (!success) return errorResult('Task not found');
        return textResult({ success: true, message: 'Task deleted' });
      } else {
        // restore
        if (!args.id) return errorResult('id is required for "restore"');
        const task = taskService.restore(userId, args.id);
        return textResult(task);
      }
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Data Export & Statistics Tools ──────────────────────────

  server.registerTool('data_export', {
    description: 'Export all CRM data as a JSON object (contacts, relationships, notes, activities, life events, reminders, gifts, debts, tasks, tags)',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);
      const data = dataExportService.exportAll(userId);
      return textResult(data);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('data_statistics', {
    description: 'Get CRM statistics and overview (contact counts, activity counts, pending items, etc.)',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);
      const stats = dataExportService.getStatistics(userId);
      return textResult(stats);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Prime Tool (Context Loader) ─────────────────────────────

  server.registerTool('prime', {
    description: 'IMPORTANT: Call this tool FIRST before any other tool to load essential CRM context. ' +
      'Returns a compact overview of the user\'s data: the current user\'s identity (name, email, contact_id), ' +
      'all tags, the 200 most recently updated contacts ' +
      '(id, name, and tag IDs), and the 10 most recent notes. This primes your context so you can reference ' +
      'contacts by name, understand the user\'s tag taxonomy, and see recent activity without needing ' +
      'separate list calls. Always call this at the start of a conversation.',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);

      // Current user identity
      const userRow = db.prepare(
        'SELECT id, name, email, created_at FROM users WHERE id = ?'
      ).get(userId) as { id: string; name: string; email: string; created_at: string } | undefined;

      // Self-contact ID
      const selfContact = db.prepare(
        'SELECT id FROM contacts WHERE user_id = ? AND is_me = 1 AND deleted_at IS NULL'
      ).get(userId) as { id: string } | undefined;

      // Tags: id + name only
      const tagRows = db.prepare(
        'SELECT id, name FROM tags WHERE user_id = ? ORDER BY name'
      ).all(userId) as { id: string; name: string }[];

      // Contacts: top 200 most recently updated, compact form
      const contactRows = db.prepare(`
        SELECT id, first_name, last_name, nickname, company
        FROM contacts
        WHERE user_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 200
      `).all(userId) as { id: string; first_name: string; last_name: string | null; nickname: string | null; company: string | null }[];

      // For each contact, get their tag IDs
      const contactTagStmt = db.prepare(
        'SELECT tag_id FROM contact_tags WHERE contact_id = ?'
      );

      const compactContacts = contactRows.map(c => {
        const tagIds = (contactTagStmt.all(c.id) as { tag_id: string }[]).map(r => r.tag_id);
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
        const entry: Record<string, unknown> = { id: c.id, name };
        if (c.nickname) entry.nick = c.nickname;
        if (c.company) entry.co = c.company;
        if (tagIds.length > 0) entry.tags = tagIds;
        return entry;
      });

      // Recent notes: 10 most recent, capped at 1000 chars each
      const noteRows = db.prepare(`
        SELECT n.id, n.contact_id, n.title, n.body, n.created_at
        FROM notes n
        JOIN contacts c ON n.contact_id = c.id
        WHERE c.user_id = ? AND n.deleted_at IS NULL AND c.deleted_at IS NULL
        ORDER BY n.created_at DESC
        LIMIT 10
      `).all(userId) as { id: string; contact_id: string; title: string | null; body: string; created_at: string }[];

      const compactNotes = noteRows.map(n => ({
        id: n.id,
        contact_id: n.contact_id,
        title: n.title,
        body: n.body.length > 1000 ? n.body.substring(0, 1000) + '...' : n.body,
        created_at: n.created_at,
      }));

      const totalContacts = (db.prepare(
        'SELECT COUNT(*) as count FROM contacts WHERE user_id = ? AND deleted_at IS NULL'
      ).get(userId) as { count: number }).count;

      const result = {
        current_timestamp: new Date().toISOString(),
        me: userRow ? { user_id: userRow.id, contact_id: selfContact?.id ?? null, name: userRow.name, email: userRow.email, _note: 'Use contact_id (not user_id) when creating relationships involving yourself.' } : null,
        total_contacts: totalContacts,
        showing_contacts: compactContacts.length,
        tags: tagRows,
        contacts: compactContacts,
        recent_notes: compactNotes,
      };

      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Cross-Contact Query Tools ──────────────────────────────

  server.registerTool('upcoming_birthdays', {
    description: 'Find contacts with birthdays coming up within a time window or in a specific month. ' +
      'Returns contacts sorted by soonest birthday first, with age calculations when available.',
    inputSchema: {
      days_ahead: z.number().min(1).max(365).optional()
        .describe('Look-ahead window in days from today (default: 30). Ignored if month is provided.'),
      month: z.number().min(1).max(12).optional()
        .describe('Optional: show all birthdays in a specific month (1-12) instead of using days_ahead'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = contacts.getUpcomingBirthdays(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('global_search', {
    description: 'Search across all entity types (contacts, notes, activities, life events, gifts, tasks, reminders, debts, relationships, contact methods, addresses, custom fields) in a single query. ' +
      'Returns grouped results by entity type with snippets and contact context.',
    inputSchema: {
      query: z.string().describe('Search term'),
      entity_types: z.array(z.enum(['contacts', 'notes', 'activities', 'life_events', 'gifts', 'tasks', 'reminders', 'debts', 'relationships', 'contact_methods', 'addresses', 'custom_fields'])).optional()
        .describe('Optional: filter to specific entity types (default: all types)'),
      limit_per_type: z.number().min(1).max(50).optional()
        .describe('Max results per entity type (default: 10)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = searchService.globalSearch(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contacts_needing_attention', {
    description: 'Find contacts you haven\'t interacted with recently — the "who am I neglecting?" query. ' +
      'Returns contacts sorted by staleness (longest since last interaction first). ' +
      'Contacts with zero interactions are included and sorted first.',
    inputSchema: {
      days_since_last_interaction: z.number().optional()
        .describe('Minimum days since last activity to be included (default: 30)'),
      status: z.enum(['active', 'archived']).optional()
        .describe('Contact status filter (default: active)'),
      tag_name: z.string().optional()
        .describe('Filter to contacts with this tag (e.g., "close friends")'),
      is_favorite: z.boolean().optional()
        .describe('Filter to favorites only'),
      limit: z.number().min(1).max(100).optional()
        .describe('Max results to return (default: 20)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = contacts.getContactsNeedingAttention(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('upcoming_reminders', {
    description: 'Find upcoming and overdue reminders across all contacts. ' +
      'Returns reminders sorted by date (overdue first, then soonest upcoming).',
    inputSchema: {
      days_ahead: z.number().min(1).max(365).optional()
        .describe('Look-ahead window in days from today (default: 14)'),
      status: z.enum(['active', 'snoozed']).optional()
        .describe('Filter by reminder status (default: active)'),
      include_overdue: z.boolean().optional()
        .describe('Include overdue reminders with reminder_date before today (default: true)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = reminderService.getUpcomingReminders(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Prompts ───────────────────────────────────────────────────

  registerPrompts(server, getUserId);

  // ─── Batch Operations ────────────────────────────────────────

  server.registerTool('batch_create_contacts', {
    description: 'Create multiple contacts in one call. Max 50 items per batch. Runs atomically — if any item fails, the entire batch is rolled back.',
    inputSchema: {
      contacts: z.array(z.object({
        first_name: z.string().describe('First name (required)'),
        last_name: z.string().optional().describe('Last name'),
        nickname: z.string().optional().describe('Nickname'),
        maiden_name: z.string().optional().describe('Maiden name'),
        gender: z.string().optional().describe('Gender'),
        pronouns: z.string().optional().describe('Pronouns (e.g. she/her, he/him, they/them)'),
        avatar_url: z.string().optional().describe('Avatar URL'),
        birthday_mode: z.enum(['full_date', 'month_day', 'approximate_age']).optional()
          .describe('Birthday mode: full_date (YYYY-MM-DD), month_day (month + day only), or approximate_age (birth year estimate)'),
        birthday_date: z.string().optional().describe('Full birthday date (YYYY-MM-DD), used with birthday_mode=full_date'),
        birthday_month: z.number().optional().describe('Birthday month (1-12), used with birthday_mode=month_day'),
        birthday_day: z.number().optional().describe('Birthday day (1-31), used with birthday_mode=month_day'),
        birthday_year_approximate: z.number().optional().describe('Approximate birth year, used with birthday_mode=approximate_age'),
        status: z.enum(['active', 'archived', 'deceased']).optional().describe('Contact status (default: active)'),
        deceased_date: z.string().optional().describe('Date of death (YYYY-MM-DD)'),
        is_favorite: z.boolean().optional().describe('Mark as favorite'),
        met_at_date: z.string().optional().describe('Date you met this person (YYYY-MM-DD)'),
        met_at_location: z.string().optional().describe('Where you met this person'),
        met_through_contact_id: z.string().optional().describe('Contact ID of person who introduced you'),
        met_description: z.string().optional().describe('Story of how you met'),
        job_title: z.string().optional().describe('Job title'),
        company: z.string().optional().describe('Company or organization'),
        industry: z.string().optional().describe('Industry'),
        work_notes: z.string().optional().describe('Notes about their work'),
      })).describe('Array of contact creation inputs (max 50)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const created = contacts.batchCreate(userId, args.contacts);
      return textResult({ created, count: created.length });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('batch_tag_contacts', {
    description: 'Apply a tag to multiple contacts in one call. Max 50 contacts per batch. Creates the tag if it doesn\'t exist. Runs atomically — if any item fails, the entire batch is rolled back.',
    inputSchema: {
      tag_name: z.string().describe('Tag name to apply'),
      contact_ids: z.array(z.string()).describe('Array of contact IDs to tag (max 50)'),
      color: z.string().optional().describe('Tag color (only used if creating new tag)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = tags.batchTagContacts(userId, args.tag_name, args.contact_ids, args.color);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('batch_create_activities', {
    description: 'Create multiple activities/interactions in one call. Max 50 items per batch. Runs atomically — if any item fails, the entire batch is rolled back.',
    inputSchema: {
      activities: z.array(z.object({
        type: z.enum(['phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other'])
          .describe('Type of interaction'),
        title: z.string().optional().describe('Title (e.g. "Coffee at Blue Bottle")'),
        description: z.string().optional().describe('Description or notes'),
        occurred_at: z.string().describe('When it happened (ISO date/datetime)'),
        duration_minutes: z.number().optional().describe('Duration in minutes'),
        location: z.string().optional().describe('Where it happened'),
        activity_type_id: z.string().optional().describe('Custom activity type ID'),
        participant_contact_ids: z.array(z.string()).describe('Contact IDs of participants'),
      })).describe('Array of activity creation inputs (max 50)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const created = activityService.batchCreate(userId, args.activities);
      return textResult({ created, count: created.length });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  return server;
}
