import Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export interface TimelineEntry {
  type: 'activity' | 'life_event' | 'note' | 'contact_created';
  id: string;
  title: string;
  description: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

export interface TimelineOptions {
  page?: number;
  per_page?: number;
  entry_type?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// ─── Service ────────────────────────────────────────────────────

export class TimelineService {
  constructor(private db: Database.Database) {}

  /**
   * Get the unified timeline for a contact.
   * Aggregates activities, life events, notes, and contact creation.
   */
  getTimeline(contactId: string, options: TimelineOptions = {}): PaginatedResult<TimelineEntry> {
    const page = options.page ?? 1;
    const perPage = options.per_page ?? 20;
    const offset = (page - 1) * perPage;

    const entries: TimelineEntry[] = [];

    // Activities (where contact is a participant)
    if (!options.entry_type || options.entry_type === 'activity') {
      const activities = this.db.prepare(`
        SELECT a.* FROM activities a
        JOIN activity_participants ap ON ap.activity_id = a.id
        WHERE ap.contact_id = ? AND a.deleted_at IS NULL
        ORDER BY a.occurred_at DESC
      `).all(contactId) as any[];

      for (const a of activities) {
        entries.push({
          type: 'activity',
          id: a.id,
          title: a.title || `${a.type.replace(/_/g, ' ')}`,
          description: a.description,
          occurred_at: a.occurred_at,
          metadata: { activity_type: a.type, duration_minutes: a.duration_minutes, location: a.location },
        });
      }
    }

    // Life events
    if (!options.entry_type || options.entry_type === 'life_event') {
      const events = this.db.prepare(`
        SELECT * FROM life_events
        WHERE contact_id = ? AND deleted_at IS NULL
        ORDER BY occurred_at DESC
      `).all(contactId) as any[];

      for (const e of events) {
        entries.push({
          type: 'life_event',
          id: e.id,
          title: e.title,
          description: e.description,
          occurred_at: e.occurred_at || e.created_at,
          metadata: { event_type: e.event_type },
        });
      }
    }

    // Notes
    if (!options.entry_type || options.entry_type === 'note') {
      const notes = this.db.prepare(`
        SELECT * FROM notes
        WHERE contact_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC
      `).all(contactId) as any[];

      for (const n of notes) {
        entries.push({
          type: 'note',
          id: n.id,
          title: n.title || 'Note',
          description: n.body,
          occurred_at: n.created_at,
          metadata: { is_pinned: Boolean(n.is_pinned) },
        });
      }
    }

    // Contact creation
    if (!options.entry_type || options.entry_type === 'contact_created') {
      const contact = this.db.prepare(
        'SELECT id, first_name, last_name, created_at FROM contacts WHERE id = ? AND deleted_at IS NULL'
      ).get(contactId) as any;

      if (contact) {
        entries.push({
          type: 'contact_created',
          id: contact.id,
          title: `Contact created: ${contact.first_name}${contact.last_name ? ' ' + contact.last_name : ''}`,
          description: null,
          occurred_at: contact.created_at,
          metadata: {},
        });
      }
    }

    // Sort by occurred_at DESC
    entries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

    const total = entries.length;
    const paginated = entries.slice(offset, offset + perPage);

    return { data: paginated, total, page, per_page: perPage };
  }
}
