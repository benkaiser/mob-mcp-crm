import Database from 'better-sqlite3';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// ─── Tag Service ────────────────────────────────────────────────

export class TagService {
  constructor(private db: Database.Database) {}

  /**
   * Create a new tag. If a tag with the same name already exists for the user,
   * returns the existing tag (on-the-fly creation).
   */
  create(userId: string, name: string, color?: string): Tag {
    const existing = this.db.prepare(
      'SELECT * FROM tags WHERE user_id = ? AND name = ?'
    ).get(userId, name) as Tag | undefined;

    if (existing) return existing;

    const id = generateId();
    this.db.prepare(`
      INSERT INTO tags (id, user_id, name, color)
      VALUES (?, ?, ?, ?)
    `).run(id, userId, name, color ?? null);

    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag;
  }

  update(userId: string, tagId: string, updates: { name?: string; color?: string }): Tag | null {
    const existing = this.db.prepare(
      'SELECT * FROM tags WHERE id = ? AND user_id = ?'
    ).get(tagId, userId) as Tag | undefined;

    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }

    if (fields.length === 0) return existing;

    values.push(tagId);
    this.db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as Tag;
  }

  delete(userId: string, tagId: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM tags WHERE id = ? AND user_id = ?'
    ).run(tagId, userId);
    return result.changes > 0;
  }

  list(userId: string): Tag[] {
    return this.db.prepare(
      'SELECT * FROM tags WHERE user_id = ? ORDER BY name'
    ).all(userId) as Tag[];
  }

  /**
   * Tag a contact. Creates the tag if it doesn't exist.
   */
  tagContact(userId: string, contactId: string, tagName: string, color?: string): Tag {
    const tag = this.create(userId, tagName, color);

    // Check if already tagged
    const existing = this.db.prepare(
      'SELECT 1 FROM contact_tags WHERE contact_id = ? AND tag_id = ?'
    ).get(contactId, tag.id);

    if (!existing) {
      this.db.prepare(
        'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)'
      ).run(contactId, tag.id);
    }

    return tag;
  }

  /**
   * Remove a tag from a contact.
   */
  untagContact(contactId: string, tagId: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?'
    ).run(contactId, tagId);
    return result.changes > 0;
  }

  /**
   * Tag multiple contacts with the same tag in one call.
   * Creates the tag if it doesn't exist.
   */
  batchTagContacts(userId: string, tagName: string, contactIds: string[], color?: string): { tag: Tag; tagged_contact_ids: string[] } {
    if (contactIds.length > 50) {
      throw new Error('Batch size exceeds maximum of 50 items');
    }

    const taggedIds: string[] = [];

    const transaction = this.db.transaction(() => {
      const tag = this.create(userId, tagName, color);

      for (let i = 0; i < contactIds.length; i++) {
        try {
          this.tagContact(userId, contactIds[i], tagName, color);
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
