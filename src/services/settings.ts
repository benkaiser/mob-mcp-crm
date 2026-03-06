import Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export interface UserSettings {
  user_id: string;
  timezone: string;
  birthday_reminder_time: string;
  birthday_reminder_offsets: number[];
  created_at: string;
  updated_at: string;
}

export interface UpdateSettingsInput {
  timezone?: string;
  birthday_reminder_time?: string;
  birthday_reminder_offsets?: number[];
}

// ─── Validation ─────────────────────────────────────────────────

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidTime(time: string): boolean {
  return TIME_REGEX.test(time);
}

function isValidOffsets(offsets: number[]): boolean {
  return Array.isArray(offsets) &&
    offsets.length > 0 &&
    offsets.every(n => Number.isInteger(n) && n >= 0);
}

// ─── Service ────────────────────────────────────────────────────

export class UserSettingsService {
  constructor(private db: Database.Database) {}

  /**
   * Get settings for a user. Auto-creates defaults if missing.
   */
  get(userId: string): UserSettings {
    const row = this.db.prepare(
      'SELECT * FROM user_settings WHERE user_id = ?'
    ).get(userId) as any;

    if (row) {
      return this.mapRow(row);
    }

    // Auto-create defaults
    this.db.prepare(
      'INSERT INTO user_settings (user_id) VALUES (?)'
    ).run(userId);

    return this.get(userId);
  }

  /**
   * Update user settings. Validates all inputs.
   */
  update(userId: string, changes: UpdateSettingsInput): UserSettings {
    // Ensure settings row exists
    this.get(userId);

    if (changes.timezone !== undefined) {
      if (!isValidTimezone(changes.timezone)) {
        throw new Error(`Invalid timezone: ${changes.timezone}`);
      }
    }

    if (changes.birthday_reminder_time !== undefined) {
      if (!isValidTime(changes.birthday_reminder_time)) {
        throw new Error(`Invalid time format: ${changes.birthday_reminder_time}. Use HH:MM (24-hour)`);
      }
    }

    if (changes.birthday_reminder_offsets !== undefined) {
      if (!isValidOffsets(changes.birthday_reminder_offsets)) {
        throw new Error('birthday_reminder_offsets must be a non-empty array of non-negative integers');
      }
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (changes.timezone !== undefined) {
      fields.push('timezone = ?');
      values.push(changes.timezone);
    }
    if (changes.birthday_reminder_time !== undefined) {
      fields.push('birthday_reminder_time = ?');
      values.push(changes.birthday_reminder_time);
    }
    if (changes.birthday_reminder_offsets !== undefined) {
      fields.push('birthday_reminder_offsets = ?');
      values.push(JSON.stringify(changes.birthday_reminder_offsets));
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(userId);
      this.db.prepare(
        `UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`
      ).run(...values);
    }

    return this.get(userId);
  }

  /**
   * Create default settings for a user with optional timezone.
   */
  createDefaults(userId: string, timezone?: string): void {
    const tz = timezone && isValidTimezone(timezone) ? timezone : 'UTC';
    this.db.prepare(
      'INSERT OR IGNORE INTO user_settings (user_id, timezone) VALUES (?, ?)'
    ).run(userId, tz);
  }

  private mapRow(row: any): UserSettings {
    return {
      user_id: row.user_id,
      timezone: row.timezone,
      birthday_reminder_time: row.birthday_reminder_time,
      birthday_reminder_offsets: JSON.parse(row.birthday_reminder_offsets),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
