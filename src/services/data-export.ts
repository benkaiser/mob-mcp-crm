import Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export interface ExportData {
  exported_at: string;
  version: string;
  contacts: any[];
  relationships: any[];
  notes: any[];
  activities: any[];
  life_events: any[];
  reminders: any[];
  notifications: any[];
  gifts: any[];
  debts: any[];
  tasks: any[];
  tags: any[];
}

export interface CrmStatistics {
  total_contacts: number;
  active_contacts: number;
  archived_contacts: number;
  favorite_contacts: number;
  total_activities: number;
  total_notes: number;
  total_life_events: number;
  total_relationships: number;
  pending_reminders: number;
  active_debts: number;
  pending_tasks: number;
  gift_ideas: number;
  tags_count: number;
  contacts_by_company: { company: string; count: number }[];
  recent_activities: number; // activities in last 30 days
}

// ─── Service ────────────────────────────────────────────────────

export class DataExportService {
  constructor(private db: Database.Database) {}

  exportAll(userId: string): ExportData {
    const contacts = this.db.prepare(
      'SELECT * FROM contacts WHERE user_id = ? AND deleted_at IS NULL'
    ).all(userId);

    const contactIds = (contacts as any[]).map((c) => c.id);

    // Get relationships for these contacts
    const relationships = contactIds.length > 0
      ? this.db.prepare(
        `SELECT * FROM relationships WHERE contact_id IN (${contactIds.map(() => '?').join(',')})`)
        .all(...contactIds)
      : [];

    // Get notes
    const notes = contactIds.length > 0
      ? this.db.prepare(
        `SELECT * FROM notes WHERE contact_id IN (${contactIds.map(() => '?').join(',')}) AND deleted_at IS NULL`)
        .all(...contactIds)
      : [];

    // Get activities
    const activities = this.db.prepare(
      'SELECT * FROM activities WHERE user_id = ? AND deleted_at IS NULL'
    ).all(userId);

    // Get activity participants
    const activityIds = (activities as any[]).map((a) => a.id);
    const participants = activityIds.length > 0
      ? this.db.prepare(
        `SELECT * FROM activity_participants WHERE activity_id IN (${activityIds.map(() => '?').join(',')})`)
        .all(...activityIds)
      : [];

    // Attach participants to activities
    const activitiesWithParticipants = (activities as any[]).map((a) => ({
      ...a,
      participants: (participants as any[]).filter((p) => p.activity_id === a.id).map((p) => p.contact_id),
    }));

    // Get life events
    const lifeEvents = contactIds.length > 0
      ? this.db.prepare(
        `SELECT * FROM life_events WHERE contact_id IN (${contactIds.map(() => '?').join(',')}) AND deleted_at IS NULL`)
        .all(...contactIds)
      : [];

    // Get reminders
    const reminders = contactIds.length > 0
      ? this.db.prepare(
        `SELECT * FROM reminders WHERE contact_id IN (${contactIds.map(() => '?').join(',')}) AND deleted_at IS NULL`)
        .all(...contactIds)
      : [];

    // Get notifications
    const notifications = this.db.prepare(
      'SELECT * FROM notifications WHERE user_id = ?'
    ).all(userId);

    // Get gifts
    const gifts = contactIds.length > 0
      ? this.db.prepare(
        `SELECT * FROM gifts WHERE contact_id IN (${contactIds.map(() => '?').join(',')}) AND deleted_at IS NULL`)
        .all(...contactIds)
      : [];

    // Get debts
    const debts = contactIds.length > 0
      ? this.db.prepare(
        `SELECT * FROM debts WHERE contact_id IN (${contactIds.map(() => '?').join(',')}) AND deleted_at IS NULL`)
        .all(...contactIds)
      : [];

    // Get tasks
    const tasks = this.db.prepare(
      'SELECT * FROM tasks WHERE user_id = ? AND deleted_at IS NULL'
    ).all(userId);

    // Get tags
    const tags = this.db.prepare(
      'SELECT * FROM tags WHERE user_id = ?'
    ).all(userId);

    return {
      exported_at: new Date().toISOString(),
      version: '1.0',
      contacts,
      relationships,
      notes,
      activities: activitiesWithParticipants,
      life_events: lifeEvents,
      reminders,
      notifications,
      gifts,
      debts,
      tasks,
      tags,
    };
  }

  getStatistics(userId: string): CrmStatistics {
    const contactStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
        SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END) as favorites
      FROM contacts WHERE user_id = ? AND deleted_at IS NULL
    `).get(userId) as any;

    const activityCount = (this.db.prepare(
      'SELECT COUNT(*) as count FROM activities WHERE user_id = ? AND deleted_at IS NULL'
    ).get(userId) as any).count;

    const noteCount = (this.db.prepare(`
      SELECT COUNT(*) as count FROM notes n
      JOIN contacts c ON n.contact_id = c.id
      WHERE c.user_id = ? AND n.deleted_at IS NULL
    `).get(userId) as any).count;

    const lifeEventCount = (this.db.prepare(`
      SELECT COUNT(*) as count FROM life_events le
      JOIN contacts c ON le.contact_id = c.id
      WHERE c.user_id = ? AND le.deleted_at IS NULL
    `).get(userId) as any).count;

    const relationshipCount = (this.db.prepare(`
      SELECT COUNT(*) as count FROM relationships r
      JOIN contacts c ON r.contact_id = c.id
      WHERE c.user_id = ?
    `).get(userId) as any).count;

    const pendingReminders = (this.db.prepare(`
      SELECT COUNT(*) as count FROM reminders r
      JOIN contacts c ON r.contact_id = c.id
      WHERE c.user_id = ? AND r.deleted_at IS NULL AND r.status = 'active'
    `).get(userId) as any).count;

    const activeDebts = (this.db.prepare(`
      SELECT COUNT(*) as count FROM debts d
      JOIN contacts c ON d.contact_id = c.id
      WHERE c.user_id = ? AND d.deleted_at IS NULL AND d.status = 'active'
    `).get(userId) as any).count;

    const pendingTasks = (this.db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND deleted_at IS NULL AND status != 'completed'"
    ).get(userId) as any).count;

    const giftIdeas = (this.db.prepare(`
      SELECT COUNT(*) as count FROM gifts g
      JOIN contacts c ON g.contact_id = c.id
      WHERE c.user_id = ? AND g.deleted_at IS NULL AND g.status = 'idea'
    `).get(userId) as any).count;

    const tagsCount = (this.db.prepare(
      'SELECT COUNT(*) as count FROM tags WHERE user_id = ?'
    ).get(userId) as any).count;

    const contactsByCompany = this.db.prepare(`
      SELECT company, COUNT(*) as count
      FROM contacts
      WHERE user_id = ? AND deleted_at IS NULL AND company IS NOT NULL AND company != ''
      GROUP BY company
      ORDER BY count DESC
      LIMIT 20
    `).all(userId) as any[];

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const recentActivities = (this.db.prepare(
      'SELECT COUNT(*) as count FROM activities WHERE user_id = ? AND deleted_at IS NULL AND occurred_at >= ?'
    ).get(userId, thirtyDaysAgo) as any).count;

    return {
      total_contacts: contactStats.total,
      active_contacts: contactStats.active,
      archived_contacts: contactStats.archived,
      favorite_contacts: contactStats.favorites,
      total_activities: activityCount,
      total_notes: noteCount,
      total_life_events: lifeEventCount,
      total_relationships: relationshipCount,
      pending_reminders: pendingReminders,
      active_debts: activeDebts,
      pending_tasks: pendingTasks,
      gift_ideas: giftIdeas,
      tags_count: tagsCount,
      contacts_by_company: contactsByCompany,
      recent_activities: recentActivities,
    };
  }
}
