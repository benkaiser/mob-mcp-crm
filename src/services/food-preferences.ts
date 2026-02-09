import Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export interface FoodPreferences {
  id: string;
  contact_id: string;
  dietary_restrictions: string[];
  allergies: string[];
  favorite_foods: string[];
  disliked_foods: string[];
  notes: string | null;
}

export interface UpsertFoodPreferencesInput {
  contact_id: string;
  dietary_restrictions?: string[];
  allergies?: string[];
  favorite_foods?: string[];
  disliked_foods?: string[];
  notes?: string;
}

// ─── Service ────────────────────────────────────────────────────

export class FoodPreferencesService {
  constructor(private db: Database.Database) {}

  get(contactId: string): FoodPreferences | null {
    const row = this.db.prepare(
      'SELECT * FROM food_preferences WHERE contact_id = ?'
    ).get(contactId) as any;

    if (!row) return null;
    return this.mapRow(row);
  }

  upsert(input: UpsertFoodPreferencesInput): FoodPreferences {
    const existing = this.get(input.contact_id);

    if (existing) {
      this.db.prepare(`
        UPDATE food_preferences
        SET dietary_restrictions = ?, allergies = ?, favorite_foods = ?, disliked_foods = ?, notes = ?
        WHERE contact_id = ?
      `).run(
        JSON.stringify(input.dietary_restrictions ?? []),
        JSON.stringify(input.allergies ?? []),
        JSON.stringify(input.favorite_foods ?? []),
        JSON.stringify(input.disliked_foods ?? []),
        input.notes ?? null,
        input.contact_id,
      );
    } else {
      const id = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
      this.db.prepare(`
        INSERT INTO food_preferences (id, contact_id, dietary_restrictions, allergies, favorite_foods, disliked_foods, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.contact_id,
        JSON.stringify(input.dietary_restrictions ?? []),
        JSON.stringify(input.allergies ?? []),
        JSON.stringify(input.favorite_foods ?? []),
        JSON.stringify(input.disliked_foods ?? []),
        input.notes ?? null,
      );
    }

    return this.get(input.contact_id)!;
  }

  private mapRow(row: any): FoodPreferences {
    return {
      id: row.id,
      contact_id: row.contact_id,
      dietary_restrictions: row.dietary_restrictions ? JSON.parse(row.dietary_restrictions) : [],
      allergies: row.allergies ? JSON.parse(row.allergies) : [],
      favorite_foods: row.favorite_foods ? JSON.parse(row.favorite_foods) : [],
      disliked_foods: row.disliked_foods ? JSON.parse(row.disliked_foods) : [],
      notes: row.notes,
    };
  }
}
