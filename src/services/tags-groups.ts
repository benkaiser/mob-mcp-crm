import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { recordAudit, userIdForContact } from './audit-helper.js';

// ─── Types ──────────────────────────────────────────────────────

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

// ─── Tag Service ────────────────────────────────────────────────

export class TagService {
  constructor(private db: Database.Database) {}

  /**
   * Create a new tag. If a tag with the same name already exists for the user,
   * returns the existing tag (on-the-fly creation).
   */
  create(userId: string, name: string): Tag {
    const existing = this.db.prepare(
      'SELECT * FROM tags WHERE user_id = ? AND name = ?'
    ).get(userId, name) as Tag | undefined;

    if (existing) return existing;

    const id = generateId();
    this.db.prepare(`
      INSERT INTO tags (id, user_id, name)
      VALUES (?, ?, ?)
    `).run(id, userId, name);

    const created = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag;
    recordAudit(this.db, userId, 'tag', id, 'create', undefined, created);
    return created;
  }

  update(userId: string, tagId: string, updates: { name?: string }): Tag | null {
    const existing = this.db.prepare(
      'SELECT * FROM tags WHERE id = ? AND user_id = ?'
    ).get(tagId, userId) as Tag | undefined;

    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }

    if (fields.length === 0) return existing;

    values.push(tagId);
    this.db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag;
    recordAudit(this.db, userId, 'tag', tagId, 'update', existing, updated);
    return updated;
  }

  delete(userId: string, tagId: string): boolean {
    const existing = this.db.prepare(
      'SELECT * FROM tags WHERE id = ? AND user_id = ?'
    ).get(tagId, userId) as Tag | undefined;
    if (!existing) return false;

    const result = this.db.prepare(
      'DELETE FROM tags WHERE id = ? AND user_id = ?'
    ).run(tagId, userId);
    const deleted = result.changes > 0;
    if (deleted) recordAudit(this.db, userId, 'tag', tagId, 'delete', existing, undefined);
    return deleted;
  }

  list(userId: string): Tag[] {
    return this.db.prepare(
      'SELECT * FROM tags WHERE user_id = ? ORDER BY name'
    ).all(userId) as Tag[];
  }

  /**
   * Tag a contact. Creates the tag if it doesn't exist.
   */
  tagContact(userId: string, contactId: string, tagName: string): Tag {
    const tag = this.create(userId, tagName);

    // Check if already tagged
    const existing = this.db.prepare(
      'SELECT 1 FROM contact_tags WHERE contact_id = ? AND tag_id = ?'
    ).get(contactId, tag.id);

    if (!existing) {
      this.db.prepare(
        'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)'
      ).run(contactId, tag.id);
      recordAudit(this.db, userId, 'contact_tag', `${contactId}:${tag.id}`, 'create', undefined, { contact_id: contactId, tag_id: tag.id });
    }

    return tag;
  }

  /**
   * Remove a tag from a contact.
   */
  untagContact(contactId: string, tagId: string): boolean {
    const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag | undefined;
    const result = this.db.prepare(
      'DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?'
    ).run(contactId, tagId);
    const deleted = result.changes > 0;
    const userId = userIdForContact(this.db, contactId);
    if (deleted && userId) {
      recordAudit(this.db, userId, 'contact_tag', `${contactId}:${tagId}`, 'delete', { contact_id: contactId, tag_id: tagId, tag_name: tag?.name }, undefined);
    }
    return deleted;
  }

  /**
   * Tag multiple contacts with the same tag in one call.
   * Creates the tag if it doesn't exist.
   */
  batchTagContacts(userId: string, tagName: string, contactIds: string[]): { tag: Tag; tagged_contact_ids: string[] } {
    if (contactIds.length > 50) {
      throw new Error('Batch size exceeds maximum of 50 items');
    }

    const taggedIds: string[] = [];

    const transaction = this.db.transaction(() => {
      const tag = this.create(userId, tagName);

      for (let i = 0; i < contactIds.length; i++) {
        try {
          this.tagContact(userId, contactIds[i], tagName);
          taggedIds.push(contactIds[i]);
        } catch (err: any) {
          throw new Error(`Failed to tag contact at index ${i} (${contactIds[i]}): ${err.message}`);
        }
      }

      return tag;
    });

    const tag = transaction();
    return { tag, tagged_contact_ids: taggedIds };
  }

  /**
   * List all tags for a contact.
   */
  listByContact(contactId: string): Tag[] {
    return this.db.prepare(`
      SELECT t.* FROM tags t
      JOIN contact_tags ct ON ct.tag_id = t.id
      WHERE ct.contact_id = ?
      ORDER BY t.name
    `).all(contactId) as Tag[];
  }
}
