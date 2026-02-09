import Database from 'better-sqlite3';

// ─── Relationship Type Map ──────────────────────────────────────

/**
 * Maps each relationship type to its inverse type.
 * When a relationship is created from A → B with type X,
 * an inverse relationship B → A is automatically created with type inverse(X).
 */
const INVERSE_MAP: Record<string, string> = {
  // Love
  significant_other: 'significant_other',
  spouse: 'spouse',
  date: 'date',
  lover: 'lover',
  in_love_with: 'in_love_with',
  secret_lover: 'secret_lover',
  ex_boyfriend_girlfriend: 'ex_boyfriend_girlfriend',
  ex_husband_wife: 'ex_husband_wife',

  // Family
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  uncle_aunt: 'nephew_niece',
  nephew_niece: 'uncle_aunt',
  cousin: 'cousin',
  godparent: 'godchild',
  godchild: 'godparent',
  step_parent: 'step_child',
  step_child: 'step_parent',

  // Friend
  friend: 'friend',
  best_friend: 'best_friend',

  // Work
  colleague: 'colleague',
  boss: 'subordinate',
  subordinate: 'boss',
  mentor: 'protege',
  protege: 'mentor',
};

/**
 * Get the inverse of a relationship type.
 * For custom/unknown types, returns the same type (symmetric).
 */
export function getInverseType(type: string): string {
  return INVERSE_MAP[type] ?? type;
}

/**
 * Get all valid relationship types.
 */
export function getRelationshipTypes(): string[] {
  return Object.keys(INVERSE_MAP);
}

// ─── Types ──────────────────────────────────────────────────────

export interface Relationship {
  id: string;
  contact_id: string;
  related_contact_id: string;
  relationship_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRelationshipInput {
  contact_id: string;
  related_contact_id: string;
  relationship_type: string;
  notes?: string;
}

export interface UpdateRelationshipInput {
  relationship_type?: string;
  notes?: string;
}

// ─── Service ────────────────────────────────────────────────────

export class RelationshipService {
  constructor(private db: Database.Database) {}

  /**
   * Add a relationship between two contacts.
   * Automatically creates the inverse relationship.
   * Returns the forward relationship.
   */
  add(input: CreateRelationshipInput): Relationship {
    const forwardId = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    const inverseId = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
    const now = new Date().toISOString();
    const inverseType = getInverseType(input.relationship_type);

    const insertStmt = this.db.prepare(`
      INSERT INTO relationships (id, contact_id, related_contact_id, relationship_type, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      // Forward: A → B
      insertStmt.run(forwardId, input.contact_id, input.related_contact_id, input.relationship_type, input.notes ?? null, now, now);
      // Inverse: B → A
      insertStmt.run(inverseId, input.related_contact_id, input.contact_id, inverseType, input.notes ?? null, now, now);
    });

    transaction();

    return this.getById(forwardId)!;
  }

  /**
   * Update a relationship. Also updates the inverse relationship's type if changed.
   */
  update(id: string, input: UpdateRelationshipInput): Relationship | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (input.relationship_type !== undefined) {
      fields.push('relationship_type = ?');
      values.push(input.relationship_type);
    }
    if (input.notes !== undefined) {
      fields.push('notes = ?');
      values.push(input.notes);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const transaction = this.db.transaction(() => {
      // Update the forward relationship
      this.db.prepare(`UPDATE relationships SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      // Update the inverse relationship too
      const inverseFields: string[] = [];
      const inverseValues: any[] = [];

      if (input.relationship_type !== undefined) {
        inverseFields.push('relationship_type = ?');
        inverseValues.push(getInverseType(input.relationship_type));
      }
      if (input.notes !== undefined) {
        inverseFields.push('notes = ?');
        inverseValues.push(input.notes);
      }

      if (inverseFields.length > 0) {
        inverseFields.push("updated_at = datetime('now')");
        inverseValues.push(existing.related_contact_id, existing.contact_id);

        this.db.prepare(`
          UPDATE relationships SET ${inverseFields.join(', ')}
          WHERE contact_id = ? AND related_contact_id = ?
        `).run(...inverseValues);
      }
    });

    transaction();

    return this.getById(id);
  }

  /**
   * Remove a relationship. Also removes the inverse relationship.
   */
  remove(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;

    const transaction = this.db.transaction(() => {
      // Remove forward
      this.db.prepare('DELETE FROM relationships WHERE id = ?').run(id);
      // Remove inverse
      this.db.prepare(`
        DELETE FROM relationships
        WHERE contact_id = ? AND related_contact_id = ?
      `).run(existing.related_contact_id, existing.contact_id);
    });

    transaction();
    return true;
  }

  /**
   * List all relationships for a contact.
   */
  listByContact(contactId: string): Relationship[] {
    return this.db.prepare(
      'SELECT * FROM relationships WHERE contact_id = ? ORDER BY relationship_type, created_at'
    ).all(contactId) as Relationship[];
  }

  private getById(id: string): Relationship | null {
    return this.db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as Relationship | undefined ?? null;
  }
}
