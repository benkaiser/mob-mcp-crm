import Database from 'better-sqlite3';
import { generateId } from '../utils.js';
import { recordAudit, userIdForContact } from './audit-helper.js';

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

const CANONICAL_CATEGORIES: Record<string, string> = {
  significant_other: 'Love',
  spouse: 'Love',
  date: 'Love',
  lover: 'Love',
  in_love_with: 'Love',
  secret_lover: 'Love',
  ex_boyfriend_girlfriend: 'Love',
  ex_husband_wife: 'Love',
  parent: 'Family',
  child: 'Family',
  sibling: 'Family',
  grandparent: 'Family',
  grandchild: 'Family',
  uncle_aunt: 'Family',
  nephew_niece: 'Family',
  cousin: 'Family',
  godparent: 'Family',
  godchild: 'Family',
  step_parent: 'Family',
  step_child: 'Family',
  friend: 'Friend',
  best_friend: 'Friend',
  colleague: 'Work',
  boss: 'Work',
  subordinate: 'Work',
  mentor: 'Work',
  protege: 'Work',
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

function labelForValue(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeRelationshipTypeValue(value: string): string {
  return slugify(value);
}

export interface RelationshipTypeOption {
  value: string;
  label: string;
  inverse_value: string;
  category: string;
  source: 'canonical' | 'custom';
}

export interface CustomRelationshipType {
  id: string;
  user_id: string;
  value: string;
  label: string | null;
  inverse_value: string;
  created_at: string;
  updated_at: string;
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

export interface RelationshipWithNames extends Relationship {
  contact_name: string;
  related_contact_name: string;
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

export interface CreateCustomRelationshipTypeInput {
  label: string;
  inverse_value?: string;
}

export interface UpdateCustomRelationshipTypeInput {
  label?: string;
  inverse_value?: string;
}

export class DuplicateRelationshipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateRelationshipError';
  }
}

export function isDuplicateRelationshipError(err: unknown): err is DuplicateRelationshipError {
  return err instanceof DuplicateRelationshipError;
}

export function getCanonicalRelationshipTypeOptions(): RelationshipTypeOption[] {
  return getRelationshipTypes().map((value) => ({
    value,
    label: labelForValue(value),
    inverse_value: getInverseType(value),
    category: CANONICAL_CATEGORIES[value] ?? 'Other',
    source: 'canonical',
  }));
}

export function getRelationshipTypeOptionsForUser(db: Database.Database, userId: string): RelationshipTypeOption[] {
  const options = getCanonicalRelationshipTypeOptions();
  const seen = new Set(options.map((o) => o.value));
  const custom = new CustomRelationshipTypeService(db).list(userId);

  for (const type of custom) {
    const forward: RelationshipTypeOption = {
      value: type.value,
      label: type.label ?? labelForValue(type.value),
      inverse_value: type.inverse_value,
      category: 'Custom',
      source: 'custom',
    };
    if (!seen.has(forward.value)) {
      options.push(forward);
      seen.add(forward.value);
    }

    if (!seen.has(type.inverse_value)) {
      options.push({
        value: type.inverse_value,
        label: labelForValue(type.inverse_value),
        inverse_value: type.value,
        category: 'Custom',
        source: 'custom',
      });
      seen.add(type.inverse_value);
    }
  }

  return options;
}

export function getRelationshipTypesForUser(db: Database.Database, userId: string): string[] {
  return getRelationshipTypeOptionsForUser(db, userId).map((o) => o.value);
}

export function isRelationshipTypeAllowedForUser(db: Database.Database, userId: string, type: string): boolean {
  return getRelationshipTypesForUser(db, userId).includes(type);
}

export function getInverseTypeForUser(db: Database.Database, userId: string, type: string): string {
  if (INVERSE_MAP[type]) return INVERSE_MAP[type];

  const row = db.prepare(`
    SELECT value, inverse_value
    FROM custom_relationship_types
    WHERE user_id = ? AND (value = ? OR inverse_value = ?)
    ORDER BY CASE WHEN value = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(userId, type, type, type) as { value: string; inverse_value: string } | undefined;

  if (!row) return type;
  return row.value === type ? row.inverse_value : row.value;
}

export class CustomRelationshipTypeService {
  constructor(private db: Database.Database) {}

  list(userId: string): CustomRelationshipType[] {
    return this.db.prepare(`
      SELECT * FROM custom_relationship_types
      WHERE user_id = ?
      ORDER BY label COLLATE NOCASE, value COLLATE NOCASE
    `).all(userId) as CustomRelationshipType[];
  }

  create(userId: string, input: CreateCustomRelationshipTypeInput): CustomRelationshipType {
    const label = input.label.trim();
    const value = slugify(label);
    this.validateDerivedValue(value);
    const inverseValue = this.resolveInverseValue(input.inverse_value, value);
    if (INVERSE_MAP[value]) throw new Error(`"${label}" is a built-in relationship type`);

    const id = generateId();
    try {
      this.db.prepare(`
        INSERT INTO custom_relationship_types (id, user_id, value, label, inverse_value)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, userId, value, label, inverseValue);
    } catch (err: any) {
      if (this.isUniqueConstraintError(err)) {
        throw new Error('A relationship type with a similar name already exists');
      }
      throw err;
    }

    const created = this.get(userId, id)!;
    recordAudit(this.db, userId, 'custom_relationship_type', id, 'create', undefined, created);
    return created;
  }

  delete(userId: string, id: string): boolean {
    const existing = this.get(userId, id);
    if (!existing) return false;
    const result = this.db.prepare('DELETE FROM custom_relationship_types WHERE id = ? AND user_id = ?').run(id, userId);
    const deleted = result.changes > 0;
    if (deleted) recordAudit(this.db, userId, 'custom_relationship_type', id, 'delete', existing, undefined);
    return deleted;
  }

  update(userId: string, id: string, input: UpdateCustomRelationshipTypeInput): CustomRelationshipType | null {
    const existing = this.get(userId, id);
    if (!existing) return null;

    const label = input.label !== undefined ? input.label.trim() : existing.label ?? labelForValue(existing.value);
    const value = input.label !== undefined ? slugify(label) : existing.value;
    if (input.label !== undefined) {
      this.validateDerivedValue(value);
      if (INVERSE_MAP[value]) throw new Error(`"${label}" is a built-in relationship type`);
    }

    const inverseValue = input.inverse_value !== undefined || input.label !== undefined
      ? this.resolveInverseValue(input.inverse_value, value)
      : existing.inverse_value;

    if (input.label === undefined && input.inverse_value === undefined) return existing;

    try {
      this.db.prepare(`
        UPDATE custom_relationship_types
        SET value = ?, label = ?, inverse_value = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(value, label, inverseValue, id, userId);
    } catch (err: any) {
      if (this.isUniqueConstraintError(err)) {
        throw new Error('A relationship type with a similar name already exists');
      }
      throw err;
    }

    const updated = this.get(userId, id);
    if (updated) recordAudit(this.db, userId, 'custom_relationship_type', id, 'update', existing, updated);
    return updated;
  }


  private validateDerivedValue(value: string): void {
    if (!value) throw new Error('Label must include at least one letter or number');
  }

  private resolveInverseValue(inverse: string | undefined, defaultValue: string): string {
    const inverseValue = inverse?.trim() ? slugify(inverse) : defaultValue;
    if (!inverseValue) throw new Error('Inverse value must include at least one letter or number');
    return inverseValue;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    const sqliteError = err as { code?: string; message?: string };
    return sqliteError.code === 'SQLITE_CONSTRAINT_UNIQUE' || sqliteError.message?.includes('UNIQUE constraint failed') === true;
  }

  get(userId: string, id: string): CustomRelationshipType | null {
    const row = this.db.prepare('SELECT * FROM custom_relationship_types WHERE id = ? AND user_id = ?')
      .get(id, userId) as CustomRelationshipType | undefined;
    return row ?? null;
  }

  mergedList(userId: string): RelationshipTypeOption[] {
    return getRelationshipTypeOptionsForUser(this.db, userId);
  }
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
    // Validate both contact IDs exist before attempting insert
    const contact = this.db.prepare('SELECT id, user_id, first_name, last_name FROM contacts WHERE id = ?').get(input.contact_id) as { id: string; user_id: string; first_name: string; last_name: string | null } | undefined;
    const related = this.db.prepare('SELECT id, user_id, first_name, last_name FROM contacts WHERE id = ?').get(input.related_contact_id) as { id: string; user_id: string; first_name: string; last_name: string | null } | undefined;

    // Check if the invalid ID is actually the user's own ID (common mistake)
    const isUserIdCheck = (id: string) => {
      const user = this.db.prepare('SELECT id, name FROM users WHERE id = ?').get(id) as { id: string; name: string } | undefined;
      return user ? ` This looks like your own user ID (${user.name}) — you cannot use your user ID as a contact_id. Use your self-contact ID instead (available from the \`me\` or \`prime\` tool).` : '';
    };

    if (!contact && !related) {
      const hint1 = isUserIdCheck(input.contact_id);
      const hint2 = input.contact_id !== input.related_contact_id ? isUserIdCheck(input.related_contact_id) : '';
      throw new Error(`Neither contact exists — contact_id "${input.contact_id}" and related_contact_id "${input.related_contact_id}" were not found.${hint1}${hint2} Use contact_list or contact_search to find valid contact IDs.`);
    }
    if (!contact) {
      const relatedName = [related!.first_name, related!.last_name].filter(Boolean).join(' ');
      const hint = isUserIdCheck(input.contact_id);
      throw new Error(`contact_id "${input.contact_id}" not found.${hint} The related_contact_id resolved to "${relatedName}" (${input.related_contact_id}). Use contact_list or contact_search to find the correct ID for the other contact.`);
    }
    if (!related) {
      const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
      const hint = isUserIdCheck(input.related_contact_id);
      throw new Error(`related_contact_id "${input.related_contact_id}" not found.${hint} The contact_id resolved to "${contactName}" (${input.contact_id}). Use contact_list or contact_search to find the correct ID for the related contact.`);
    }

    if (input.contact_id === input.related_contact_id) {
      throw new Error('contact_id and related_contact_id cannot be the same — a contact cannot have a relationship with itself.');
    }

    const forwardId = generateId();
    const inverseId = generateId();
    const now = new Date().toISOString();
    const inverseType = getInverseTypeForUser(this.db, contact.user_id, input.relationship_type);
    this.throwIfDuplicate(input.contact_id, input.related_contact_id, input.relationship_type);

    const insertStmt = this.db.prepare(`
      INSERT INTO relationships (id, contact_id, related_contact_id, relationship_type, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      const transaction = this.db.transaction(() => {
        // Forward: A → B
        insertStmt.run(forwardId, input.contact_id, input.related_contact_id, input.relationship_type, input.notes ?? null, now, now);
        // Inverse: B → A
        insertStmt.run(inverseId, input.related_contact_id, input.contact_id, inverseType, input.notes ?? null, now, now);
      });

      transaction();
    } catch (err: any) {
      if (this.isRelationshipUniqueConstraintError(err)) {
        throw this.duplicateError(input.contact_id, input.related_contact_id, input.relationship_type);
      }
      throw err;
    }

    const forward = this.getById(forwardId)!;
    const inverse = this.getById(inverseId)!;
    recordAudit(this.db, contact.user_id, 'relationship', forwardId, 'create', undefined, forward);
    recordAudit(this.db, contact.user_id, 'relationship', inverseId, 'create', undefined, inverse);
    return forward;
  }

  /**
   * Update a relationship. Also updates the inverse relationship's type if changed.
   */
  update(id: string, input: UpdateRelationshipInput): Relationship | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const userId = userIdForContact(this.db, existing.contact_id);
    const inverseExisting = this.db.prepare(`
      SELECT * FROM relationships
      WHERE contact_id = ? AND related_contact_id = ?
    `).get(existing.related_contact_id, existing.contact_id) as Relationship | undefined;

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
        const owner = this.ownerOfContact(existing.contact_id);
        inverseValues.push(owner ? getInverseTypeForUser(this.db, owner, input.relationship_type) : getInverseType(input.relationship_type));
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

    try {
      transaction();
    } catch (err) {
      if (this.isRelationshipUniqueConstraintError(err)) {
        throw this.duplicateError(
          existing.contact_id,
          existing.related_contact_id,
          input.relationship_type ?? existing.relationship_type,
        );
      }
      throw err;
    }

    const updated = this.getById(id);
    if (userId && updated) recordAudit(this.db, userId, 'relationship', id, 'update', existing, updated);
    if (userId && inverseExisting) {
      const inverseUpdated = this.getById(inverseExisting.id);
      if (inverseUpdated) recordAudit(this.db, userId, 'relationship', inverseExisting.id, 'update', inverseExisting, inverseUpdated);
    }
    return updated;
  }

  updateForContact(contactId: string, id: string, input: UpdateRelationshipInput): Relationship | null {
    const existing = this.getById(id);
    if (!existing || existing.contact_id !== contactId) return null;
    return this.update(id, input);
  }

  /**
   * Remove a relationship. Also removes the inverse relationship.
   */
  remove(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    const userId = userIdForContact(this.db, existing.contact_id);
    const inverseExisting = this.db.prepare(`
      SELECT * FROM relationships
      WHERE contact_id = ? AND related_contact_id = ?
    `).get(existing.related_contact_id, existing.contact_id) as Relationship | undefined;

    const transaction = this.db.transaction(() => {
      // Remove forward
      this.db.prepare('DELETE FROM relationships WHERE id = ?').run(id);
      // Remove inverse
      this.db.prepare(`
        DELETE FROM relationships
        WHERE contact_id = ? AND related_contact_id = ? AND relationship_type = ?
      `).run(existing.related_contact_id, existing.contact_id, getInverseType(existing.relationship_type));
    });

    transaction();
    if (userId) {
      recordAudit(this.db, userId, 'relationship', id, 'delete', existing, undefined);
      if (inverseExisting) {
        recordAudit(this.db, userId, 'relationship', inverseExisting.id, 'delete', inverseExisting, undefined);
      }
    }
    return true;
  }

  removeForContact(contactId: string, id: string): boolean {
    const existing = this.getById(id);
    if (!existing || existing.contact_id !== contactId) return false;
    return this.remove(id);
  }

  /**
   * List all relationships for a contact, including names of both contacts.
   */
  listByContact(contactId: string): RelationshipWithNames[] {
    return this.db.prepare(`
      SELECT r.*,
        TRIM(c1.first_name || ' ' || COALESCE(c1.last_name, '')) AS contact_name,
        TRIM(c2.first_name || ' ' || COALESCE(c2.last_name, '')) AS related_contact_name
      FROM relationships r
      JOIN contacts c1 ON r.contact_id = c1.id
      JOIN contacts c2 ON r.related_contact_id = c2.id
      WHERE r.contact_id = ?
      ORDER BY r.relationship_type, r.created_at
    `).all(contactId) as RelationshipWithNames[];
  }

  private getById(id: string): Relationship | null {
    return this.db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as Relationship | undefined ?? null;
  }

  private ownerOfContact(contactId: string): string | null {
    const row = this.db.prepare('SELECT user_id FROM contacts WHERE id = ?').get(contactId) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }

  private throwIfDuplicate(contactId: string, relatedContactId: string, relationshipType: string): void {
    const existing = this.db.prepare(`
      SELECT id FROM relationships
      WHERE contact_id = ? AND related_contact_id = ? AND relationship_type = ?
      LIMIT 1
    `).get(contactId, relatedContactId, relationshipType);
    if (existing) throw this.duplicateError(contactId, relatedContactId, relationshipType);
  }

  private duplicateError(contactId: string, relatedContactId: string, relationshipType: string): DuplicateRelationshipError {
    const contactName = this.contactName(contactId);
    const relatedName = this.contactName(relatedContactId);
    return new DuplicateRelationshipError(`A "${relationshipType}" relationship already exists between ${contactName} and ${relatedName}. Use relationship_update to modify it, or relationship_list to see existing relationships.`);
  }

  private contactName(contactId: string): string {
    const row = this.db.prepare('SELECT first_name, last_name FROM contacts WHERE id = ?')
      .get(contactId) as { first_name: string; last_name: string | null } | undefined;
    return row ? [row.first_name, row.last_name].filter(Boolean).join(' ') : contactId;
  }

  private isRelationshipUniqueConstraintError(err: unknown): boolean {
    const sqliteError = err as { code?: string; message?: string };
    return sqliteError.code === 'SQLITE_CONSTRAINT_UNIQUE'
      || sqliteError.message?.includes('UNIQUE constraint failed: relationships.contact_id, relationships.related_contact_id, relationships.relationship_type') === true
      || sqliteError.message?.includes('UNIQUE constraint failed') === true;
  }
}
