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

// ─── Helpers ──────────────────────────────────────────────────────

/** Extract the authenticated userId from the tool callback's extra parameter */
function getUserId(extra: { authInfo?: AuthInfo }): string {
  const userId = extra.authInfo?.extra?.userId as string | undefined;
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
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
    description: 'Get full contact details including all sub-entities (contact methods, addresses, food preferences, custom fields)',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const contact = contacts.get(userId, args.contact_id);
      if (!contact) return errorResult('Contact not found');

      // Enrich with sub-entities
      const result = {
        ...contact,
        contact_methods: contactMethods.listByContact(args.contact_id),
        addresses: addresses.listByContact(args.contact_id),
        food_preferences: foodPreferences.get(args.contact_id),
        custom_fields: customFields.listByContact(args.contact_id),
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

  server.registerTool('contact_search', {
    description: 'Full-text search across contacts by name, company, job title, or nickname',
    inputSchema: {
      query: z.string().describe('Search query'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = contacts.list(userId, {
        search: args.query,
        page: args.page,
        per_page: args.per_page,
      });
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Contact Method Tools ─────────────────────────────────────

  server.registerTool('contact_method_add', {
    description: 'Add a contact method (email, phone, social handle, etc.) to a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      type: z.enum(['email', 'phone', 'whatsapp', 'telegram', 'signal', 'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other'])
        .describe('Type of contact method'),
      value: z.string().describe('The value (e.g. email address, phone number, handle)'),
      label: z.string().optional().describe('Label (e.g. "Personal", "Work")'),
      is_primary: z.boolean().optional().describe('Set as the primary method for this type (default: false)'),
    },
  }, (args) => {
    try {
      const method = contactMethods.add(args);
      return textResult(method);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_method_update', {
    description: 'Update an existing contact method',
    inputSchema: {
      id: z.string().describe('The contact method ID'),
      type: z.enum(['email', 'phone', 'whatsapp', 'telegram', 'signal', 'twitter', 'instagram', 'facebook', 'linkedin', 'website', 'other'])
        .optional().describe('Type of contact method'),
      value: z.string().optional().describe('The value'),
      label: z.string().optional().describe('Label'),
      is_primary: z.boolean().optional().describe('Set as primary'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const method = contactMethods.update(id, updates);
      if (!method) return errorResult('Contact method not found');
      return textResult(method);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_method_remove', {
    description: 'Remove a contact method',
    inputSchema: {
      id: z.string().describe('The contact method ID to remove'),
    },
  }, (args) => {
    try {
      const success = contactMethods.remove(args.id);
      if (!success) return errorResult('Contact method not found');
      return textResult({ success: true, message: 'Contact method removed' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Address Tools ────────────────────────────────────────────

  server.registerTool('address_add', {
    description: 'Add an address to a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      label: z.string().optional().describe('Label (e.g. "Home", "Work")'),
      street_line_1: z.string().optional().describe('Street address line 1'),
      street_line_2: z.string().optional().describe('Street address line 2'),
      city: z.string().optional().describe('City'),
      state_province: z.string().optional().describe('State or province'),
      postal_code: z.string().optional().describe('Postal/ZIP code'),
      country: z.string().optional().describe('Country (ISO 3166-1 alpha-2 code recommended)'),
      is_primary: z.boolean().optional().describe('Set as the primary address (default: false)'),
    },
  }, (args) => {
    try {
      const address = addresses.add(args);
      return textResult(address);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('address_update', {
    description: 'Update an existing address',
    inputSchema: {
      id: z.string().describe('The address ID'),
      label: z.string().optional().describe('Label'),
      street_line_1: z.string().optional().describe('Street address line 1'),
      street_line_2: z.string().optional().describe('Street address line 2'),
      city: z.string().optional().describe('City'),
      state_province: z.string().optional().describe('State or province'),
      postal_code: z.string().optional().describe('Postal/ZIP code'),
      country: z.string().optional().describe('Country'),
      is_primary: z.boolean().optional().describe('Set as primary'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const address = addresses.update(id, updates);
      if (!address) return errorResult('Address not found');
      return textResult(address);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('address_remove', {
    description: 'Remove an address from a contact',
    inputSchema: {
      id: z.string().describe('The address ID to remove'),
    },
  }, (args) => {
    try {
      const success = addresses.remove(args.id);
      if (!success) return errorResult('Address not found');
      return textResult({ success: true, message: 'Address removed' });
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
  }, (args) => {
    try {
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
  }, (args) => {
    try {
      const prefs = foodPreferences.upsert(args);
      return textResult(prefs);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Custom Field Tools ───────────────────────────────────────

  server.registerTool('custom_field_add', {
    description: 'Add a custom field to a contact (for any data that doesn\'t fit standard fields)',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      field_name: z.string().describe('Field name (e.g. "Favorite Color", "T-shirt Size")'),
      field_value: z.string().describe('Field value'),
      field_group: z.string().optional().describe('Optional group to organize fields (e.g. "Preferences", "Work")'),
    },
  }, (args) => {
    try {
      const field = customFields.add(args);
      return textResult(field);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('custom_field_update', {
    description: 'Update an existing custom field',
    inputSchema: {
      id: z.string().describe('The custom field ID'),
      field_name: z.string().optional().describe('Field name'),
      field_value: z.string().optional().describe('Field value'),
      field_group: z.string().optional().describe('Field group'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const field = customFields.update(id, updates);
      if (!field) return errorResult('Custom field not found');
      return textResult(field);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('custom_field_remove', {
    description: 'Remove a custom field from a contact',
    inputSchema: {
      id: z.string().describe('The custom field ID to remove'),
    },
  }, (args) => {
    try {
      const success = customFields.remove(args.id);
      if (!success) return errorResult('Custom field not found');
      return textResult({ success: true, message: 'Custom field removed' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Relationship Tools ─────────────────────────────────────

  const relationshipTypeEnum = z.enum(getRelationshipTypes() as [string, ...string[]]);

  server.registerTool('relationship_add', {
    description: 'Create a relationship between two contacts. Automatically creates the inverse relationship.',
    inputSchema: {
      contact_id: z.string().describe('The source contact ID'),
      related_contact_id: z.string().describe('The related contact ID'),
      relationship_type: relationshipTypeEnum.describe('Type of relationship (e.g. parent, spouse, friend, colleague)'),
      notes: z.string().optional().describe('Notes about this relationship'),
    },
  }, (args) => {
    try {
      const rel = relationships.add(args);
      return textResult(rel);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('relationship_update', {
    description: 'Update a relationship. Also updates the inverse relationship.',
    inputSchema: {
      id: z.string().describe('The relationship ID'),
      relationship_type: relationshipTypeEnum.optional().describe('New relationship type'),
      notes: z.string().optional().describe('Notes'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const rel = relationships.update(id, updates);
      if (!rel) return errorResult('Relationship not found');
      return textResult(rel);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('relationship_remove', {
    description: 'Remove a relationship and its inverse',
    inputSchema: {
      id: z.string().describe('The relationship ID to remove'),
    },
  }, (args) => {
    try {
      const success = relationships.remove(args.id);
      if (!success) return errorResult('Relationship not found');
      return textResult({ success: true, message: 'Relationship removed' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('relationship_list', {
    description: 'List all relationships for a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
    },
  }, (args) => {
    try {
      const rels = relationships.listByContact(args.contact_id);
      return textResult(rels);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Note Tools ───────────────────────────────────────────────

  server.registerTool('note_create', {
    description: 'Add a note to a contact. Supports markdown.',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      title: z.string().optional().describe('Optional title'),
      body: z.string().describe('Note body (supports markdown)'),
      is_pinned: z.boolean().optional().describe('Pin this note to the top (default: false)'),
    },
  }, (args) => {
    try {
      const note = notes.create(args);
      return textResult(note);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('note_list', {
    description: 'List notes for a contact. Pinned notes appear first.',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args) => {
    try {
      const { contact_id, ...options } = args;
      const result = notes.listByContact(contact_id, options);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('note_update', {
    description: 'Update a note',
    inputSchema: {
      id: z.string().describe('The note ID'),
      title: z.string().optional().describe('Title'),
      body: z.string().optional().describe('Body (supports markdown)'),
      is_pinned: z.boolean().optional().describe('Pin/unpin'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const note = notes.update(id, updates);
      if (!note) return errorResult('Note not found');
      return textResult(note);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('note_delete', {
    description: 'Soft-delete a note',
    inputSchema: {
      id: z.string().describe('The note ID to delete'),
    },
  }, (args) => {
    try {
      const success = notes.softDelete(args.id);
      if (!success) return errorResult('Note not found');
      return textResult({ success: true, message: 'Note deleted' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Tag Tools ────────────────────────────────────────────────

  server.registerTool('tag_list', {
    description: 'List all tags',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = tags.list(userId);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('tag_create', {
    description: 'Create a new tag (or return existing if name already exists)',
    inputSchema: {
      name: z.string().describe('Tag name'),
      color: z.string().optional().describe('Optional color (hex code)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const tag = tags.create(userId, args.name, args.color);
      return textResult(tag);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('tag_update', {
    description: 'Update a tag name or color',
    inputSchema: {
      id: z.string().describe('The tag ID'),
      name: z.string().optional().describe('New name'),
      color: z.string().optional().describe('New color'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const { id, ...updates } = args;
      const tag = tags.update(userId, id, updates);
      if (!tag) return errorResult('Tag not found');
      return textResult(tag);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('tag_delete', {
    description: 'Delete a tag',
    inputSchema: {
      id: z.string().describe('The tag ID to delete'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const success = tags.delete(userId, args.id);
      if (!success) return errorResult('Tag not found');
      return textResult({ success: true, message: 'Tag deleted' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_tag', {
    description: 'Tag a contact. Creates the tag if it doesn\'t exist.',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      tag_name: z.string().describe('Tag name'),
      color: z.string().optional().describe('Tag color (only used if creating new tag)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const tag = tags.tagContact(userId, args.contact_id, args.tag_name, args.color);
      return textResult(tag);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_untag', {
    description: 'Remove a tag from a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      tag_id: z.string().describe('The tag ID to remove'),
    },
  }, (args) => {
    try {
      const success = tags.untagContact(args.contact_id, args.tag_id);
      if (!success) return errorResult('Tag not found on this contact');
      return textResult({ success: true, message: 'Tag removed from contact' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('contact_tags_list', {
    description: 'List all tags for a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
    },
  }, (args) => {
    try {
      const result = tags.listByContact(args.contact_id);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Activity Tools ────────────────────────────────────────────

  server.registerTool('activity_create', {
    description: 'Record a new activity/interaction with one or more contacts',
    inputSchema: {
      type: z.enum(['phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other'])
        .describe('Type of interaction'),
      title: z.string().optional().describe('Title (e.g. "Coffee at Blue Bottle")'),
      description: z.string().optional().describe('Description or notes'),
      occurred_at: z.string().describe('When it happened (ISO date/datetime)'),
      duration_minutes: z.number().optional().describe('Duration in minutes'),
      location: z.string().optional().describe('Where it happened'),
      activity_type_id: z.string().optional().describe('Custom activity type ID'),
      participant_contact_ids: z.array(z.string()).describe('Contact IDs of participants'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const activity = activityService.create(userId, args);
      return textResult(activity);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('activity_get', {
    description: 'Get full details of an activity',
    inputSchema: {
      id: z.string().describe('The activity ID'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const activity = activityService.get(userId, args.id);
      if (!activity) return errorResult('Activity not found');
      return textResult(activity);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('activity_list', {
    description: 'List activities, optionally filtered by contact or type',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID'),
      type: z.enum(['phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other'])
        .optional().describe('Filter by interaction type'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = activityService.list(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('activity_update', {
    description: 'Update an activity',
    inputSchema: {
      id: z.string().describe('The activity ID'),
      type: z.enum(['phone_call', 'video_call', 'text_message', 'in_person', 'email', 'activity', 'other'])
        .optional().describe('Type'),
      title: z.string().optional().describe('Title'),
      description: z.string().optional().describe('Description'),
      occurred_at: z.string().optional().describe('When it happened'),
      duration_minutes: z.number().optional().describe('Duration'),
      location: z.string().optional().describe('Location'),
      participant_contact_ids: z.array(z.string()).optional().describe('Updated participant list'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const { id, ...updates } = args;
      const activity = activityService.update(userId, id, updates);
      if (!activity) return errorResult('Activity not found');
      return textResult(activity);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('activity_delete', {
    description: 'Soft-delete an activity',
    inputSchema: {
      id: z.string().describe('The activity ID to delete'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const success = activityService.softDelete(userId, args.id);
      if (!success) return errorResult('Activity not found');
      return textResult({ success: true, message: 'Activity deleted' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('activity_type_list', {
    description: 'List available custom activity types',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = activityTypes.list(userId);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('activity_type_create', {
    description: 'Create a custom activity type',
    inputSchema: {
      name: z.string().describe('Activity type name'),
      category: z.string().optional().describe('Category (e.g. "Food & Drink", "Sports")'),
      icon: z.string().optional().describe('Icon identifier'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const type = activityTypes.create(userId, args.name, args.category, args.icon);
      return textResult(type);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Life Event Tools ─────────────────────────────────────────

  server.registerTool('life_event_create', {
    description: 'Record a new life event for a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      event_type: z.string().describe('Event type (e.g. "new_job", "got_married", "moved")'),
      title: z.string().describe('Title (e.g. "Started at Google", "Moved to Berlin")'),
      description: z.string().optional().describe('Description'),
      occurred_at: z.string().optional().describe('When it happened (ISO date)'),
      related_contact_ids: z.array(z.string()).optional().describe('IDs of other contacts involved'),
    },
  }, (args) => {
    try {
      const event = lifeEvents.create(args);
      return textResult(event);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('life_event_list', {
    description: 'List life events for a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args) => {
    try {
      const { contact_id, ...options } = args;
      const result = lifeEvents.listByContact(contact_id, options);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('life_event_update', {
    description: 'Update a life event',
    inputSchema: {
      id: z.string().describe('The life event ID'),
      event_type: z.string().optional().describe('Event type'),
      title: z.string().optional().describe('Title'),
      description: z.string().optional().describe('Description'),
      occurred_at: z.string().optional().describe('When it happened'),
      related_contact_ids: z.array(z.string()).optional().describe('Updated related contacts'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const event = lifeEvents.update(id, updates);
      if (!event) return errorResult('Life event not found');
      return textResult(event);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('life_event_delete', {
    description: 'Soft-delete a life event',
    inputSchema: {
      id: z.string().describe('The life event ID to delete'),
    },
  }, (args) => {
    try {
      const success = lifeEvents.softDelete(args.id);
      if (!success) return errorResult('Life event not found');
      return textResult({ success: true, message: 'Life event deleted' });
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
  }, (args) => {
    try {
      const { contact_id, ...options } = args;
      const result = timeline.getTimeline(contact_id, options);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Reminder Tools ──────────────────────────────────────────

  server.registerTool('reminder_create', {
    description: 'Create a reminder for a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      title: z.string().describe('Reminder title'),
      description: z.string().optional().describe('Description'),
      reminder_date: z.string().describe('When to remind (ISO date YYYY-MM-DD)'),
      frequency: z.enum(['one_time', 'weekly', 'monthly', 'yearly']).optional().describe('Frequency (default: one_time)'),
    },
  }, (args) => {
    try {
      const reminder = reminderService.create(args);
      return textResult(reminder);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('reminder_list', {
    description: 'List reminders, optionally filtered by contact or status',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID'),
      status: z.enum(['active', 'snoozed', 'completed', 'dismissed']).optional().describe('Filter by status'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args) => {
    try {
      const result = reminderService.list(args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('reminder_update', {
    description: 'Update a reminder',
    inputSchema: {
      id: z.string().describe('The reminder ID'),
      title: z.string().optional().describe('Title'),
      description: z.string().optional().describe('Description'),
      reminder_date: z.string().optional().describe('New reminder date'),
      frequency: z.enum(['one_time', 'weekly', 'monthly', 'yearly']).optional().describe('Frequency'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const reminder = reminderService.update(id, updates);
      if (!reminder) return errorResult('Reminder not found');
      return textResult(reminder);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('reminder_complete', {
    description: 'Mark a reminder as completed. For recurring reminders, advances to the next occurrence.',
    inputSchema: {
      id: z.string().describe('The reminder ID'),
    },
  }, (args) => {
    try {
      const reminder = reminderService.complete(args.id);
      if (!reminder) return errorResult('Reminder not found');
      return textResult(reminder);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('reminder_snooze', {
    description: 'Snooze a reminder to a new date',
    inputSchema: {
      id: z.string().describe('The reminder ID'),
      new_date: z.string().describe('New reminder date (ISO date YYYY-MM-DD)'),
    },
  }, (args) => {
    try {
      const reminder = reminderService.snooze(args.id, args.new_date);
      if (!reminder) return errorResult('Reminder not found');
      return textResult(reminder);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('reminder_delete', {
    description: 'Soft-delete a reminder',
    inputSchema: {
      id: z.string().describe('The reminder ID to delete'),
    },
  }, (args) => {
    try {
      const success = reminderService.softDelete(args.id);
      if (!success) return errorResult('Reminder not found');
      return textResult({ success: true, message: 'Reminder deleted' });
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
    description: 'Mark a notification as read',
    inputSchema: {
      id: z.string().describe('The notification ID'),
    },
  }, (args) => {
    try {
      const success = notificationService.markRead(args.id);
      if (!success) return errorResult('Notification not found or already read');
      return textResult({ success: true, message: 'Notification marked as read' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('notification_read_all', {
    description: 'Mark all notifications as read',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);
      const count = notificationService.markAllRead(userId);
      return textResult({ success: true, message: `${count} notifications marked as read` });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Gift Tools ────────────────────────────────────────────────

  server.registerTool('gift_create', {
    description: 'Track a gift idea, plan, or record a given/received gift',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      name: z.string().describe('Gift name'),
      description: z.string().optional().describe('Description'),
      url: z.string().optional().describe('Link to the gift'),
      estimated_cost: z.number().optional().describe('Estimated cost'),
      currency: z.string().optional().describe('Currency (default: USD)'),
      occasion: z.string().optional().describe('Occasion (e.g. "Birthday", "Christmas")'),
      status: z.enum(['idea', 'planned', 'purchased', 'given', 'received']).optional()
        .describe('Gift status (default: idea)'),
      direction: z.enum(['giving', 'receiving']).describe('Giving to or receiving from this contact'),
      date: z.string().optional().describe('Date of giving/receiving (ISO date)'),
    },
  }, (args) => {
    try {
      const gift = giftService.create(args);
      return textResult(gift);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('gift_list', {
    description: 'List gifts, optionally filtered by contact, status, or direction',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID'),
      status: z.enum(['idea', 'planned', 'purchased', 'given', 'received']).optional().describe('Filter by status'),
      direction: z.enum(['giving', 'receiving']).optional().describe('Filter by direction'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args) => {
    try {
      const result = giftService.list(args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('gift_update', {
    description: 'Update a gift (change status, add details, etc.)',
    inputSchema: {
      id: z.string().describe('The gift ID'),
      name: z.string().optional().describe('Gift name'),
      description: z.string().optional().describe('Description'),
      url: z.string().optional().describe('Link'),
      estimated_cost: z.number().optional().describe('Cost'),
      currency: z.string().optional().describe('Currency'),
      occasion: z.string().optional().describe('Occasion'),
      status: z.enum(['idea', 'planned', 'purchased', 'given', 'received']).optional().describe('Status'),
      direction: z.enum(['giving', 'receiving']).optional().describe('Direction'),
      date: z.string().optional().describe('Date'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const gift = giftService.update(id, updates);
      if (!gift) return errorResult('Gift not found');
      return textResult(gift);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('gift_delete', {
    description: 'Soft-delete a gift',
    inputSchema: {
      id: z.string().describe('The gift ID to delete'),
    },
  }, (args) => {
    try {
      const success = giftService.softDelete(args.id);
      if (!success) return errorResult('Gift not found');
      return textResult({ success: true, message: 'Gift deleted' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Debt Tools ────────────────────────────────────────────────

  server.registerTool('debt_create', {
    description: 'Track a debt (money owed in either direction)',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
      amount: z.number().describe('Amount owed'),
      currency: z.string().optional().describe('Currency (default: USD)'),
      direction: z.enum(['i_owe_them', 'they_owe_me']).describe('Who owes whom'),
      reason: z.string().optional().describe('Reason for the debt'),
      incurred_at: z.string().optional().describe('When the debt was incurred (ISO date)'),
    },
  }, (args) => {
    try {
      const debt = debtService.create(args);
      return textResult(debt);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('debt_list', {
    description: 'List debts, optionally filtered by contact or status',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID'),
      status: z.enum(['active', 'settled']).optional().describe('Filter by status'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args) => {
    try {
      const result = debtService.list(args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('debt_update', {
    description: 'Update a debt',
    inputSchema: {
      id: z.string().describe('The debt ID'),
      amount: z.number().optional().describe('Amount'),
      currency: z.string().optional().describe('Currency'),
      direction: z.enum(['i_owe_them', 'they_owe_me']).optional().describe('Direction'),
      reason: z.string().optional().describe('Reason'),
      incurred_at: z.string().optional().describe('When incurred'),
    },
  }, (args) => {
    try {
      const { id, ...updates } = args;
      const debt = debtService.update(id, updates);
      if (!debt) return errorResult('Debt not found');
      return textResult(debt);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('debt_settle', {
    description: 'Mark a debt as settled',
    inputSchema: {
      id: z.string().describe('The debt ID'),
    },
  }, (args) => {
    try {
      const debt = debtService.settle(args.id);
      if (!debt) return errorResult('Debt not found');
      return textResult(debt);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('debt_delete', {
    description: 'Soft-delete a debt',
    inputSchema: {
      id: z.string().describe('The debt ID to delete'),
    },
  }, (args) => {
    try {
      const success = debtService.softDelete(args.id);
      if (!success) return errorResult('Debt not found');
      return textResult({ success: true, message: 'Debt deleted' });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('debt_summary', {
    description: 'Get the net balance summary for debts with a contact',
    inputSchema: {
      contact_id: z.string().describe('The contact ID'),
    },
  }, (args) => {
    try {
      const summary = debtService.summary(args.contact_id);
      return textResult(summary);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Task Tools ────────────────────────────────────────────────

  server.registerTool('task_create', {
    description: 'Create a task, optionally linked to a contact',
    inputSchema: {
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Description'),
      contact_id: z.string().optional().describe('Link to a contact'),
      due_date: z.string().optional().describe('Due date (ISO date)'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority (default: medium)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const task = taskService.create(userId, args);
      return textResult(task);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('task_list', {
    description: 'List tasks, optionally filtered by contact, status, or priority',
    inputSchema: {
      contact_id: z.string().optional().describe('Filter by contact ID'),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority'),
      page: z.number().optional().describe('Page number (default: 1)'),
      per_page: z.number().optional().describe('Results per page (default: 20)'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const result = taskService.list(userId, args);
      return textResult(result);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('task_update', {
    description: 'Update a task',
    inputSchema: {
      id: z.string().describe('The task ID'),
      title: z.string().optional().describe('Title'),
      description: z.string().optional().describe('Description'),
      contact_id: z.string().optional().describe('Link to a contact'),
      due_date: z.string().optional().describe('Due date'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority'),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Status'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const { id, ...updates } = args;
      const task = taskService.update(userId, id, updates);
      if (!task) return errorResult('Task not found');
      return textResult(task);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('task_complete', {
    description: 'Mark a task as completed',
    inputSchema: {
      id: z.string().describe('The task ID'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const task = taskService.complete(userId, args.id);
      if (!task) return errorResult('Task not found');
      return textResult(task);
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  server.registerTool('task_delete', {
    description: 'Soft-delete a task',
    inputSchema: {
      id: z.string().describe('The task ID to delete'),
    },
  }, (args, extra) => {
    try {
      const userId = getUserId(extra);
      const success = taskService.softDelete(userId, args.id);
      if (!success) return errorResult('Task not found');
      return textResult({ success: true, message: 'Task deleted' });
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

  // ─── Me Tool (Current User Identity) ──────────────────────────

  server.registerTool('me', {
    description: 'Get information about the current user (you). Returns your name, email, and account creation date. ' +
      'Use this when the user asks "who am I?" or needs their own identity/profile information.',
    inputSchema: {},
  }, (_args, extra) => {
    try {
      const userId = getUserId(extra);

      const userRow = db.prepare(
        'SELECT id, name, email, created_at, updated_at FROM users WHERE id = ?'
      ).get(userId) as { id: string; name: string; email: string; created_at: string; updated_at: string } | undefined;

      if (!userRow) {
        return errorResult('User not found');
      }

      return textResult({
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        created_at: userRow.created_at,
        updated_at: userRow.updated_at,
      });
    } catch (err: any) {
      return errorResult(err.message);
    }
  });

  // ─── Prime Tool (Context Loader) ─────────────────────────────

  server.registerTool('prime', {
    description: 'IMPORTANT: Call this tool FIRST before any other tool to load essential CRM context. ' +
      'Returns a compact overview of the user\'s data: the current user\'s identity (call the "me" tool for full details), ' +
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
        me: userRow ? { id: userRow.id, name: userRow.name, email: userRow.email } : null,
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

  // ─── Prompts ───────────────────────────────────────────────────

  server.registerPrompt('daily-briefing', {
    title: 'Daily Briefing',
    description: 'Get your morning CRM overview: upcoming reminders, birthdays, pending tasks, unread notifications, and unsettled debts.',
  }, (extra) => {
    const userId = getUserId(extra);
    const today = new Date().toISOString().slice(0, 10);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Give me my daily CRM briefing for today (${today}). Please:

1. Check for any **upcoming and overdue reminders** (use reminder_list with status "active")
2. Look for any **birthdays today or in the next 7 days** (use contact_list and check birthday fields)
3. Show **pending and in-progress tasks** (use task_list with status "pending", then "in_progress")
4. Check for **unread notifications** (use notification_list with unread_only true)
5. Show any **unsettled debts** (use debt_list with status "active")
6. Show recent **CRM statistics** (use data_statistics)

Present everything in a clean, organized summary. Highlight anything urgent (overdue items, today's birthdays). If everything is clear, let me know that too!`,
        },
      }],
    };
  });

  server.registerPrompt('prepare-for-meeting', {
    title: 'Prepare for Meeting',
    description: 'Get a comprehensive dossier on a contact before meeting them: profile, recent activity, notes, relationships, food preferences, and pending items.',
    argsSchema: {
      contact_name: z.string().describe('Name of the contact to prepare for'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `I'm preparing to meet with **${args.contact_name}**. Please compile a comprehensive dossier:

1. **Find the contact** (use contact_search for "${args.contact_name}")
2. **Full profile** (use contact_get with their ID — includes contact methods, addresses, food preferences, custom fields)
3. **Recent timeline** (use contact_timeline to see recent activities, notes, life events)
4. **Relationships** (use relationship_list to see who they're connected to)
5. **Pinned/recent notes** (use note_list to see important notes)
6. **Pending reminders** about them (use reminder_list filtered by their contact ID)
7. **Pending tasks** related to them (use task_list filtered by their contact ID)
8. **Gift history** (use gift_list filtered by their contact ID)
9. **Debts** (use debt_summary for their contact ID)

Organize this into a meeting prep brief with key talking points, things to remember, and any action items.`,
        },
      }],
    };
  });

  server.registerPrompt('log-interaction', {
    title: 'Log Interaction',
    description: 'Quickly log an interaction from a natural language description. Parses who, what, when, and where into a structured activity.',
    argsSchema: {
      description: z.string().describe('Natural language description of the interaction (e.g. "Had coffee with Sarah and Mike on Tuesday at Blue Bottle, talked about their new house")'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please log the following interaction in my CRM:

"${args.description}"

Steps:
1. **Prime context** (use prime to load contacts so you can match names)
2. **Parse the description** to identify:
   - **Who** was involved (match to existing contacts by name)
   - **What type** of interaction (phone_call, video_call, text_message, in_person, email, activity, other)
   - **When** it happened (interpret relative dates like "yesterday", "last Tuesday", etc. relative to today)
   - **Where** it took place (if mentioned)
   - **Key details** for the description/notes
3. **Create the activity** (use activity_create with the parsed details)
4. **Optionally create a note** if there are specific details worth recording separately on one of the contacts
5. **Ask if I want to set any follow-up reminders** based on what was discussed

If any contact names don't match existing contacts, ask me if I want to create new contacts for them.`,
        },
      }],
    };
  });

  server.registerPrompt('add-new-contact', {
    title: 'Add New Contact',
    description: 'Intelligently onboard a new contact from freeform text — parses name, phone, email, social, birthday, work info, tags, relationships, and more.',
    argsSchema: {
      info: z.string().describe('Everything you know about the person (e.g. "Met Sarah Chen at the React conference, she\'s a senior engineer at Google, email sarah@example.com, birthday March 15, she\'s friends with Mike")'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Please add a new contact to my CRM based on this information:

"${args.info}"

Steps:
1. **Prime context** (use prime to load existing contacts and tags for matching)
2. **Parse the information** to extract all structured data:
   - Name (first, last, nickname)
   - Contact methods (email, phone, social handles)
   - Birthday (date, month/day, or approximate age)
   - Work info (job title, company, industry)
   - How we met (date, location, through whom, description)
   - Any tags that apply
   - Relationships to existing contacts
3. **Create the contact** (use contact_create with all parsed fields)
4. **Add contact methods** if any were mentioned (use contact_method_add)
5. **Add address** if mentioned (use address_add)
6. **Set food preferences** if mentioned (use food_preferences_upsert)
7. **Add tags** if applicable (use contact_tag)
8. **Create relationships** if they know existing contacts (use relationship_add)
9. **Add any notes** with additional context that doesn't fit structured fields (use note_create)

Present a summary of everything you created and ask if anything needs correction.`,
        },
      }],
    };
  });

  server.registerPrompt('gift-ideas', {
    title: 'Gift Ideas',
    description: 'Brainstorm personalized gift ideas for a contact based on their preferences, interests, history, and upcoming occasions.',
    argsSchema: {
      contact_name: z.string().describe('Name of the contact to brainstorm gifts for'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Help me brainstorm gift ideas for **${args.contact_name}**. Please:

1. **Find the contact** (use contact_search for "${args.contact_name}")
2. **Get their full profile** (use contact_get — includes food preferences, custom fields)
3. **Check past gifts** (use gift_list filtered by their contact ID to see what I've already given/received)
4. **Review their notes** (use note_list for any personal details, interests, wishlists)
5. **Check recent life events** (use life_event_list — new job, moved, etc. might inspire ideas)
6. **Check their relationships** (use relationship_list — could inform group gift ideas)

Based on all this context, suggest **5-10 personalized gift ideas** organized by:
- **Budget tiers** (under $25, $25-50, $50-100, $100+)
- **Occasion** if relevant (birthday coming up, holiday, just because)

For each idea, explain why it's a good fit based on what you know about them. Ask if I'd like to save any as gift ideas (using gift_create with status "idea").`,
        },
      }],
    };
  });

  server.registerPrompt('relationship-summary', {
    title: 'Relationship Summary',
    description: 'Get a relationship health check for a contact: interaction frequency, last contact, communication patterns, and suggestions.',
    argsSchema: {
      contact_name: z.string().describe('Name of the contact to review'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    const today = new Date().toISOString().slice(0, 10);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Give me a relationship health check for **${args.contact_name}** (today is ${today}). Please:

1. **Find the contact** (use contact_search for "${args.contact_name}")
2. **Get their profile** (use contact_get for full details)
3. **Review the full timeline** (use contact_timeline with a large per_page to see all interactions)
4. **Check activities** (use activity_list filtered by their contact ID)
5. **Check relationships** (use relationship_list to see their social connections in my network)
6. **Check pending items** (use reminder_list and task_list filtered by their contact ID)
7. **Check notes** (use note_list for context)

Analyze and present:
- **Last interaction**: When and what type
- **Interaction frequency**: How often we connect, and the trend (increasing/decreasing)
- **Communication patterns**: What types of interactions are most common
- **Relationship strength**: Your assessment based on frequency, recency, and depth of interactions
- **Key milestones**: Important life events and shared experiences
- **Pending items**: Any open reminders, tasks, or unsettled debts
- **Suggestions**: Specific, actionable ways to strengthen this relationship (e.g., "It's been 3 months since you last met in person — consider scheduling a coffee")`,
        },
      }],
    };
  });

  server.registerPrompt('weekly-review', {
    title: 'Weekly Review',
    description: 'End-of-week reflection: activities logged, tasks completed, new contacts, and contacts who may need attention.',
  }, (extra) => {
    const userId = getUserId(extra);
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Give me my weekly CRM review for the past week (${weekAgo} to ${todayStr}). Please:

1. **Get CRM statistics** (use data_statistics for an overview)
2. **Recent activities** (use activity_list with a large per_page and review which occurred this week)
3. **Completed tasks** (use task_list with status "completed" and check which were completed this week)
4. **New contacts** (use contact_list sorted by created_at desc and check which were added this week)
5. **Still pending tasks** (use task_list with status "pending" — especially overdue ones)
6. **Upcoming reminders** (use reminder_list with status "active" for next week)

Summarize:
- **This week's highlights**: Key interactions, tasks completed, new contacts added
- **By the numbers**: How many activities logged, tasks completed, contacts added
- **Needs attention**: Contacts you haven't interacted with recently but probably should (favorites, close relationships with no recent activity)
- **Coming up next week**: Upcoming reminders, birthdays, and due tasks
- **Suggestions**: Any patterns or opportunities (e.g., "You logged 5 phone calls but no in-person meetings this week")`,
        },
      }],
    };
  });

  server.registerPrompt('find-connections', {
    title: 'Find Connections',
    description: 'Search your network for people matching a specific need, skill, industry, or topic.',
    argsSchema: {
      query: z.string().describe('What you\'re looking for (e.g. "who works in real estate", "who do I know at Google", "someone who can help with legal advice")'),
    },
  }, (args, extra) => {
    const userId = getUserId(extra);
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `Help me find people in my network who match this: **${args.query}**

Please search broadly:
1. **Prime context** (use prime to load all contacts with their companies and tags)
2. **Search contacts** by name, company, and job title (use contact_search with relevant keywords)
3. **Search by tags** (use contact_list with tag_name filter for relevant tags)
4. **Search by company** (use contact_list with company filter)
5. For promising matches, **get full details** (use contact_get to check custom fields, notes, and work info)
6. For top matches, **check notes** (use note_list — notes might mention relevant skills, interests, or expertise)

Present results as:
- **Strong matches**: People who clearly fit the criteria, with why they match
- **Possible matches**: People who might be relevant based on partial information
- **Connected through**: If any matches are related to other contacts (check relationship_list)

For each match, include their name, company/role, and why they're relevant. Suggest how I might reach out (show their contact methods if available).`,
        },
      }],
    };
  });

  return server;
}
