import Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export type SearchEntityType = 'contacts' | 'notes' | 'activities' | 'life_events' | 'gifts' | 'tasks' | 'reminders' | 'debts' | 'relationships' | 'contact_methods' | 'addresses' | 'custom_fields';

export interface SearchResult {
  id: string;
  entity_type: SearchEntityType;
  title: string;
  snippet: string;
  contact_id?: string;
  contact_name?: string;
  date?: string;
  match_field?: string;
}

export interface GlobalSearchResult {
  results: Record<SearchEntityType, SearchResult[]>;
  total_matches: number;
}

// ─── Service ────────────────────────────────────────────────────

export class SearchService {
  constructor(private db: Database.Database) {}

  globalSearch(userId: string, options: {
    query: string;
    entity_types?: SearchEntityType[];
    limit_per_type?: number;
  }): GlobalSearchResult {
    const query = options.query;
    const limitPerType = Math.min(Math.max(options.limit_per_type ?? 10, 1), 50);
    const entityTypes = options.entity_types ?? ['contacts', 'notes', 'activities', 'life_events', 'gifts', 'tasks', 'reminders', 'debts', 'relationships', 'contact_methods', 'addresses', 'custom_fields'];
    const searchTerm = `%${query}%`;

    const results: Record<SearchEntityType, SearchResult[]> = {
      contacts: [],
      notes: [],
      activities: [],
      life_events: [],
      gifts: [],
      tasks: [],
      reminders: [],
      debts: [],
      relationships: [],
      contact_methods: [],
      addresses: [],
      custom_fields: [],
    };

    if (entityTypes.includes('contacts')) {
      results.contacts = this.searchContacts(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('notes')) {
      results.notes = this.searchNotes(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('activities')) {
      results.activities = this.searchActivities(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('life_events')) {
      results.life_events = this.searchLifeEvents(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('gifts')) {
      results.gifts = this.searchGifts(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('tasks')) {
      results.tasks = this.searchTasks(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('reminders')) {
      results.reminders = this.searchReminders(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('debts')) {
      results.debts = this.searchDebts(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('relationships')) {
      results.relationships = this.searchRelationships(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('contact_methods')) {
      results.contact_methods = this.searchContactMethods(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('addresses')) {
      results.addresses = this.searchAddresses(userId, searchTerm, limitPerType);
    }
    if (entityTypes.includes('custom_fields')) {
      results.custom_fields = this.searchCustomFields(userId, searchTerm, limitPerType);
    }

    let totalMatches = 0;
    for (const type of entityTypes) {
      totalMatches += results[type].length;
    }

    return { results, total_matches: totalMatches };
  }

  private extractSnippet(text: string | null, maxLength = 200): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private searchContacts(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT id, first_name, last_name, nickname, company, job_title, work_notes
      FROM contacts
      WHERE user_id = ? AND deleted_at IS NULL AND (
        first_name LIKE ? OR last_name LIKE ? OR nickname LIKE ? OR
        company LIKE ? OR job_title LIKE ? OR work_notes LIKE ?
      )
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => {
      const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
      const display = row.company ? `${name} (${row.company})` : name;

      // Determine which field matched
      let matchField = 'name';
      if (row.company && row.company.toLowerCase().includes(searchTerm.slice(1, -1).toLowerCase())) matchField = 'company';
      else if (row.job_title && row.job_title.toLowerCase().includes(searchTerm.slice(1, -1).toLowerCase())) matchField = 'job_title';
      else if (row.nickname && row.nickname.toLowerCase().includes(searchTerm.slice(1, -1).toLowerCase())) matchField = 'nickname';
      else if (row.work_notes && row.work_notes.toLowerCase().includes(searchTerm.slice(1, -1).toLowerCase())) matchField = 'work_notes';

      return {
        id: row.id,
        entity_type: 'contacts' as SearchEntityType,
        title: display,
        snippet: this.extractSnippet(row.work_notes || row.job_title || ''),
        match_field: matchField,
      };
    });
  }

  private searchNotes(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT n.id, n.title, n.body, n.created_at, n.contact_id, c.first_name, c.last_name
      FROM notes n
      JOIN contacts c ON n.contact_id = c.id
      WHERE c.user_id = ? AND n.deleted_at IS NULL AND c.deleted_at IS NULL AND (
        n.title LIKE ? OR n.body LIKE ?
      )
      ORDER BY n.updated_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      entity_type: 'notes' as SearchEntityType,
      title: row.title || 'Untitled note',
      snippet: this.extractSnippet(row.body),
      contact_id: row.contact_id,
      contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      date: row.created_at,
    }));
  }

  private searchActivities(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT a.id, a.title, a.description, a.occurred_at
      FROM activities a
      WHERE a.user_id = ? AND a.deleted_at IS NULL AND (
        a.title LIKE ? OR a.description LIKE ?
      )
      ORDER BY a.occurred_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, limit) as any[];

    // Get participant names for each
    const participantStmt = this.db.prepare(`
      SELECT c.first_name, c.last_name
      FROM activity_participants ap
      JOIN contacts c ON ap.contact_id = c.id
      WHERE ap.activity_id = ?
      LIMIT 3
    `);

    return rows.map((row) => {
      const participants = participantStmt.all(row.id) as any[];
      const contactName = participants.map(p => [p.first_name, p.last_name].filter(Boolean).join(' ')).join(', ');
      return {
        id: row.id,
        entity_type: 'activities' as SearchEntityType,
        title: row.title || 'Untitled activity',
        snippet: this.extractSnippet(row.description),
        contact_name: contactName || undefined,
        date: row.occurred_at,
      };
    });
  }

  private searchLifeEvents(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT le.id, le.title, le.description, le.event_type, le.occurred_at, le.contact_id,
        c.first_name, c.last_name
      FROM life_events le
      JOIN contacts c ON le.contact_id = c.id
      WHERE c.user_id = ? AND le.deleted_at IS NULL AND c.deleted_at IS NULL AND (
        le.title LIKE ? OR le.description LIKE ? OR le.event_type LIKE ?
      )
      ORDER BY le.occurred_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      entity_type: 'life_events' as SearchEntityType,
      title: row.title,
      snippet: this.extractSnippet(row.description),
      contact_id: row.contact_id,
      contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      date: row.occurred_at,
    }));
  }

  private searchGifts(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT g.id, g.name, g.description, g.occasion, g.date, g.contact_id,
        c.first_name, c.last_name
      FROM gifts g
      JOIN contacts c ON g.contact_id = c.id
      WHERE c.user_id = ? AND g.deleted_at IS NULL AND c.deleted_at IS NULL AND (
        g.name LIKE ? OR g.description LIKE ? OR g.occasion LIKE ?
      )
      ORDER BY g.created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      entity_type: 'gifts' as SearchEntityType,
      title: row.name,
      snippet: this.extractSnippet(row.description || row.occasion || ''),
      contact_id: row.contact_id,
      contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      date: row.date,
    }));
  }

  private searchTasks(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT id, title, description, due_date, contact_id
      FROM tasks
      WHERE user_id = ? AND deleted_at IS NULL AND (
        title LIKE ? OR description LIKE ?
      )
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => {
      let contactName: string | undefined;
      if (row.contact_id) {
        const contact = this.db.prepare(
          'SELECT first_name, last_name FROM contacts WHERE id = ? AND deleted_at IS NULL'
        ).get(row.contact_id) as any;
        if (contact) {
          contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
        }
      }

      return {
        id: row.id,
        entity_type: 'tasks' as SearchEntityType,
        title: row.title,
        snippet: this.extractSnippet(row.description),
        contact_id: row.contact_id || undefined,
        contact_name: contactName,
        date: row.due_date,
      };
    });
  }

  private searchReminders(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT r.id, r.title, r.description, r.reminder_date, r.contact_id,
        c.first_name, c.last_name
      FROM reminders r
      JOIN contacts c ON r.contact_id = c.id
      WHERE c.user_id = ? AND r.deleted_at IS NULL AND c.deleted_at IS NULL AND (
        r.title LIKE ? OR r.description LIKE ?
      )
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      entity_type: 'reminders' as SearchEntityType,
      title: row.title,
      snippet: this.extractSnippet(row.description),
      contact_id: row.contact_id,
      contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      date: row.reminder_date,
    }));
  }

  private searchDebts(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT d.id, d.reason, d.amount, d.currency, d.direction, d.incurred_at, d.contact_id,
        c.first_name, c.last_name
      FROM debts d
      JOIN contacts c ON d.contact_id = c.id
      WHERE c.user_id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND (
        d.reason LIKE ?
      )
      ORDER BY d.created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, limit) as any[];

    return rows.map((row) => {
      const directionLabel = row.direction === 'i_owe_them' ? 'I owe' : 'They owe me';
      return {
        id: row.id,
        entity_type: 'debts' as SearchEntityType,
        title: `${directionLabel} ${row.amount} ${row.currency || 'USD'}`,
        snippet: this.extractSnippet(row.reason),
        contact_id: row.contact_id,
        contact_name: [row.first_name, row.last_name].filter(Boolean).join(' '),
        date: row.incurred_at,
      };
    });
  }

  private searchRelationships(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT r.id, r.relationship_type, r.contact_id, r.related_contact_id,
        c.first_name AS c_first, c.last_name AS c_last,
        rc.first_name AS rc_first, rc.last_name AS rc_last
      FROM relationships r
      JOIN contacts c ON r.contact_id = c.id
      JOIN contacts rc ON r.related_contact_id = rc.id
      WHERE c.user_id = ? AND c.deleted_at IS NULL AND rc.deleted_at IS NULL AND (
        r.relationship_type LIKE ? OR
        (rc.first_name LIKE ? OR rc.last_name LIKE ?) OR
        (c.first_name LIKE ? OR c.last_name LIKE ?)
      )
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => {
      const contactName = [row.c_first, row.c_last].filter(Boolean).join(' ');
      const relatedName = [row.rc_first, row.rc_last].filter(Boolean).join(' ');
      return {
        id: row.id,
        entity_type: 'relationships' as SearchEntityType,
        title: `${contactName} — ${row.relationship_type} — ${relatedName}`,
        snippet: `${contactName} is ${row.relationship_type} of ${relatedName}`,
        contact_id: row.contact_id,
        contact_name: contactName,
      };
    });
  }

  private searchContactMethods(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT cm.id, cm.type, cm.value, cm.label, cm.contact_id,
        c.first_name, c.last_name
      FROM contact_methods cm
      JOIN contacts c ON cm.contact_id = c.id
      WHERE c.user_id = ? AND c.deleted_at IS NULL AND (
        cm.value LIKE ?
      )
      ORDER BY cm.created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, limit) as any[];

    return rows.map((row) => {
      const contactName = [row.first_name, row.last_name].filter(Boolean).join(' ');
      return {
        id: row.contact_id,
        entity_type: 'contact_methods' as SearchEntityType,
        title: `${row.type}: ${row.value}`,
        snippet: row.label ? `${row.label} — ${row.value}` : row.value,
        contact_id: row.contact_id,
        contact_name: contactName,
        match_field: 'value',
      };
    });
  }

  private searchAddresses(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT a.id, a.label, a.street_line_1, a.street_line_2, a.city, a.state_province,
        a.postal_code, a.country, a.contact_id,
        c.first_name, c.last_name
      FROM addresses a
      JOIN contacts c ON a.contact_id = c.id
      WHERE c.user_id = ? AND c.deleted_at IS NULL AND (
        a.street_line_1 LIKE ? OR a.street_line_2 LIKE ? OR a.city LIKE ? OR
        a.state_province LIKE ? OR a.country LIKE ? OR a.postal_code LIKE ?
      )
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => {
      const contactName = [row.first_name, row.last_name].filter(Boolean).join(' ');
      const addressParts = [row.street_line_1, row.street_line_2, row.city, row.state_province, row.postal_code, row.country].filter(Boolean);
      return {
        id: row.contact_id,
        entity_type: 'addresses' as SearchEntityType,
        title: row.label ? `${row.label}: ${addressParts.join(', ')}` : addressParts.join(', '),
        snippet: addressParts.join(', '),
        contact_id: row.contact_id,
        contact_name: contactName,
      };
    });
  }

  private searchCustomFields(userId: string, searchTerm: string, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT cf.id, cf.field_name, cf.field_value, cf.field_group, cf.contact_id,
        c.first_name, c.last_name
      FROM custom_fields cf
      JOIN contacts c ON cf.contact_id = c.id
      WHERE c.user_id = ? AND c.deleted_at IS NULL AND (
        cf.field_name LIKE ? OR cf.field_value LIKE ?
      )
      ORDER BY cf.created_at DESC
      LIMIT ?
    `).all(userId, searchTerm, searchTerm, limit) as any[];

    return rows.map((row) => {
      const contactName = [row.first_name, row.last_name].filter(Boolean).join(' ');
      return {
        id: row.id,
        entity_type: 'custom_fields' as SearchEntityType,
        title: `${row.field_name}: ${row.field_value}`,
        snippet: row.field_group ? `${row.field_group} — ${row.field_name}: ${row.field_value}` : `${row.field_name}: ${row.field_value}`,
        contact_id: row.contact_id,
        contact_name: contactName,
      };
    });
  }
}
