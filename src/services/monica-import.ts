import Database from 'better-sqlite3';
import { parseMonicaExport, type MonicaParsedData } from './monica-parser.js';
import { generateId } from '../utils.js';

// ─── Type Mapping ───────────────────────────────────────────────

/** Map Monica contact_field_type names to Mob CRM contact method types */
const FIELD_TYPE_MAP: Record<string, string> = {
  email: 'email',
  phone: 'phone',
  facebook: 'facebook',
  twitter: 'twitter',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  linkedin: 'linkedin',
  signal: 'signal',
  instagram: 'instagram',
};

/** Map Monica relationship type names to Mob CRM relationship types */
const RELATIONSHIP_TYPE_MAP: Record<string, string> = {
  partner: 'significant_other',
  spouse: 'spouse',
  date: 'date',
  lover: 'lover',
  inlovewith: 'in_love_with',
  lovedby: 'in_love_with',
  ex: 'ex_boyfriend_girlfriend',
  ex_husband: 'ex_husband_wife',
  parent: 'parent',
  child: 'child',
  sibling: 'sibling',
  grandparent: 'grandparent',
  grandchild: 'grandchild',
  uncle: 'uncle_aunt',
  nephew: 'nephew_niece',
  cousin: 'cousin',
  godfather: 'godparent',
  godson: 'godchild',
  stepparent: 'step_parent',
  stepchild: 'step_child',
  friend: 'friend',
  bestfriend: 'best_friend',
  colleague: 'colleague',
  boss: 'boss',
  subordinate: 'subordinate',
  mentor: 'mentor',
  protege: 'protege',
};

/** Map Monica life event category keys to Mob CRM categories */
const LIFE_EVENT_CATEGORY_MAP: Record<string, string> = {
  work_education: 'career',
  family_relationships: 'relationships',
  home_living: 'living',
  health_wellness: 'health',
  travel_experiences: 'achievement',
};

/** Map Monica life event type keys to titles */
const LIFE_EVENT_TYPE_MAP: Record<string, string> = {
  new_job: 'New job',
  retirement: 'Retirement',
  new_school: 'New school',
  study_abroad: 'Study abroad',
  volunteer_work: 'Volunteer work',
  published_book_or_paper: 'Published book or paper',
  military_service: 'Military service',
  new_relationship: 'New relationship',
  engagement: 'Engagement',
  marriage: 'Marriage',
  anniversary: 'Anniversary',
  expecting_a_baby: 'Expecting a baby',
  new_child: 'New child',
  new_family_member: 'New family member',
  new_pet: 'New pet',
  end_of_relationship: 'End of relationship',
  loss_of_a_loved_one: 'Loss of a loved one',
  moved: 'Moved',
  bought_a_home: 'Bought a home',
  home_improvement: 'Home improvement',
  holidays: 'Holidays',
  new_vehicle: 'New vehicle',
  new_roommate: 'New roommate',
  overcame_an_illness: 'Overcame an illness',
  quit_a_habit: 'Quit a habit',
  new_eating_habits: 'New eating habits',
  weight_loss: 'Weight loss',
  wear_glass_or_contact: 'New glasses or contacts',
  broken_bone: 'Broken bone',
  removed_braces: 'Removed braces',
  surgery: 'Surgery',
  dentist: 'Dentist',
  new_sport: 'New sport',
  new_hobby: 'New hobby',
  new_instrument: 'New instrument',
  new_language: 'New language',
  tattoo_or_piercing: 'Tattoo or piercing',
  new_license: 'New license',
  travel: 'Travel',
  achievement_or_award: 'Achievement or award',
  changed_beliefs: 'Changed beliefs',
  first_word: 'First word',
  first_kiss: 'First kiss',
};

// ─── Import Result ──────────────────────────────────────────────

export interface ImportResult {
  contacts: number;
  tags: number;
  contactMethods: number;
  notes: number;
  activities: number;
  relationships: number;
  addresses: number;
  lifeEvents: number;
  gifts: number;
  reminders: number;
  calls: number;
  errors: string[];
}

// ─── Importer ───────────────────────────────────────────────────

/**
 * Import a Monica CRM SQL export into Mob CRM.
 * This will DELETE all existing data for the user first, then import.
 */
export function importMonicaExport(db: Database.Database, userId: string, sqlContent: string): ImportResult {
  const parsed = parseMonicaExport(sqlContent);
  return importParsedData(db, userId, parsed);
}


function importParsedData(db: Database.Database, userId: string, data: MonicaParsedData): ImportResult {
  const result: ImportResult = {
    contacts: 0,
    tags: 0,
    contactMethods: 0,
    notes: 0,
    activities: 0,
    relationships: 0,
    addresses: 0,
    lifeEvents: 0,
    gifts: 0,
    reminders: 0,
    calls: 0,
    errors: [],
  };

  // Monica ID → Mob ID mapping
  const contactIdMap = new Map<number, string>();
  const tagIdMap = new Map<number, string>();
  const placeMap = new Map<number, typeof data.places[0]>();

  // Build lookup maps
  const genderMap = new Map<number, string>();
  for (const g of data.genders) {
    genderMap.set(g.id, g.name.toLowerCase());
  }

  const specialDateMap = new Map<number, typeof data.specialDates[0]>();
  for (const sd of data.specialDates) {
    specialDateMap.set(sd.id, sd);
  }

  const contactFieldTypeMap = new Map<number, typeof data.contactFieldTypes[0]>();
  for (const cft of data.contactFieldTypes) {
    contactFieldTypeMap.set(cft.id, cft);
  }

  const relationshipTypeMap = new Map<number, typeof data.relationshipTypes[0]>();
  for (const rt of data.relationshipTypes) {
    relationshipTypeMap.set(rt.id, rt);
  }

  for (const p of data.places) {
    placeMap.set(p.id, p);
  }

  const lifeEventTypeMap = new Map<number, typeof data.lifeEventTypes[0]>();
  for (const let_ of data.lifeEventTypes) {
    lifeEventTypeMap.set(let_.id, let_);
  }

  const lifeEventCategoryMap = new Map<number, typeof data.lifeEventCategories[0]>();
  for (const lec of data.lifeEventCategories) {
    lifeEventCategoryMap.set(lec.id, lec);
  }

  // Activity participants lookup
  const activityParticipants = new Map<number, number[]>();
  for (const ac of data.activityContacts) {
    const existing = activityParticipants.get(ac.activity_id) ?? [];
    existing.push(ac.contact_id);
    activityParticipants.set(ac.activity_id, existing);
  }

  // Run everything in a single transaction
  const importTransaction = db.transaction(() => {
    // ── Step 0: Nuke existing user data ─────────────────
    // Delete in dependency order (children first)
    db.prepare('DELETE FROM activity_participants WHERE activity_id IN (SELECT id FROM activities WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM activities WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM life_event_contacts WHERE life_event_id IN (SELECT id FROM life_events WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?))').run(userId);
    db.prepare('DELETE FROM contact_tags WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM relationships WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM contact_methods WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM addresses WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM notes WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM reminders WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM gifts WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM life_events WHERE contact_id IN (SELECT id FROM contacts WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM tags WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM activity_types WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM contacts WHERE user_id = ?').run(userId);

    // ── Step 1: Import contacts (skip partial contacts) ──
    const insertContact = db.prepare(`
      INSERT INTO contacts (
        id, user_id, first_name, last_name, nickname, gender,
        birthday_mode, birthday_date, birthday_month, birthday_day, birthday_year_approximate,
        status, is_favorite,
        met_at_location, met_description,
        job_title, company,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const mc of data.contacts) {
      // Skip partial contacts (they're relationship-only placeholders in Monica)
      if (mc.is_partial) continue;

      const mobId = generateId();
      contactIdMap.set(mc.id, mobId);

      // Resolve gender
      let gender: string | null = null;
      if (mc.gender_id) {
        const g = genderMap.get(mc.gender_id);
        if (g === 'man') gender = 'male';
        else if (g === 'woman') gender = 'female';
        else gender = g ?? null;
      }

      // Resolve birthday
      let birthdayMode: string | null = null;
      let birthdayDate: string | null = null;
      let birthdayMonth: number | null = null;
      let birthdayDay: number | null = null;
      let birthdayYearApproximate: number | null = null;

      if (mc.birthday_special_date_id) {
        const sd = specialDateMap.get(mc.birthday_special_date_id);
        if (sd && sd.date) {
          const dateParts = sd.date.split(' ')[0]; // strip time component
          const parts = dateParts.split('-');
          if (sd.is_age_based) {
            // Age-based: Monica stores a synthetic date based on approximate age.
            // We only keep the year as an approximation.
            birthdayMode = 'approximate_age';
            birthdayYearApproximate = parseInt(parts[0], 10);
          } else if (sd.is_year_unknown) {
            birthdayMode = 'month_day';
            birthdayMonth = parseInt(parts[1], 10);
            birthdayDay = parseInt(parts[2], 10);
          } else {
            birthdayMode = 'full_date';
            birthdayDate = dateParts;
          }
        }
      }

      // Status
      let status: string = 'active';
      if (mc.is_dead) status = 'deceased';
      else if (!mc.is_active) status = 'archived';

      // "How we met" — combine first_met_where and first_met_additional_info
      const metParts = [mc.first_met_where, mc.first_met_additional_info].filter(Boolean);
      const metDescription = metParts.length > 0 ? metParts.join(' — ') : null;

      try {
        insertContact.run(
          mobId, userId, mc.first_name, mc.last_name, mc.nickname, gender,
          birthdayMode, birthdayDate, birthdayMonth, birthdayDay, birthdayYearApproximate,
          status, mc.is_starred ? 1 : 0,
          null, metDescription,
          mc.job, mc.company,
          mc.created_at ?? new Date().toISOString(),
          mc.updated_at ?? new Date().toISOString(),
        );
        result.contacts++;
      } catch (e: any) {
        result.errors.push(`Contact ${mc.first_name} ${mc.last_name}: ${e.message}`);
      }
    }

    // ── Step 2: Import tags ────────────────────────────────
    const insertTag = db.prepare(`
      INSERT INTO tags (id, user_id, name, created_at) VALUES (?, ?, ?, datetime('now'))
    `);

    for (const mt of data.tags) {
      const tagId = generateId();
      tagIdMap.set(mt.id, tagId);

      try {
        insertTag.run(tagId, userId, mt.name);
        result.tags++;
      } catch (e: any) {
        result.errors.push(`Tag ${mt.name}: ${e.message}`);
      }
    }

    // ── Step 3: Import contact-tag associations ───────────
    const insertContactTag = db.prepare(`
      INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)
    `);

    for (const ct of data.contactTags) {
      const contactMobId = contactIdMap.get(ct.contact_id);
      const tagMobId = tagIdMap.get(ct.tag_id);
      if (contactMobId && tagMobId) {
        try {
          insertContactTag.run(contactMobId, tagMobId);
        } catch (e: any) {
          result.errors.push(`Contact-Tag ${ct.contact_id}-${ct.tag_id}: ${e.message}`);
        }
      }
    }

    // ── Step 4: Import contact fields as contact methods ──
    const insertContactMethod = db.prepare(`
      INSERT INTO contact_methods (id, contact_id, type, value, label, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `);

    for (const cf of data.contactFields) {
      const contactMobId = contactIdMap.get(cf.contact_id);
      if (!contactMobId) continue;

      const fieldType = contactFieldTypeMap.get(cf.contact_field_type_id);
      if (!fieldType) continue;

      // Map Monica field type to Mob contact method type
      const typeName = fieldType.name.toLowerCase();
      let mobType = FIELD_TYPE_MAP[typeName] ?? null;

      // Also check by the `type` column (email, phone)
      if (!mobType && fieldType.type) {
        mobType = FIELD_TYPE_MAP[fieldType.type.toLowerCase()] ?? null;
      }

      if (!mobType) {
        // Unknown type — store as "other" with a label
        mobType = 'other';
      }

      try {
        insertContactMethod.run(
          generateId(),
          contactMobId,
          mobType,
          String(cf.data),
          fieldType.name,
        );
        result.contactMethods++;
      } catch (e: any) {
        result.errors.push(`ContactMethod ${cf.id}: ${e.message}`);
      }
    }

    // ── Step 5: Import notes ──────────────────────────────
    const insertNote = db.prepare(`
      INSERT INTO notes (id, contact_id, body, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const mn of data.notes) {
      const contactMobId = contactIdMap.get(mn.contact_id);
      if (!contactMobId) continue;

      try {
        insertNote.run(generateId(), contactMobId, mn.body, mn.is_favorited ? 1 : 0);
        result.notes++;
      } catch (e: any) {
        result.errors.push(`Note ${mn.id}: ${e.message}`);
      }
    }

    // ── Step 6: Import calls as notes ─────────────────────
    for (const call of data.calls) {
      const contactMobId = contactIdMap.get(call.contact_id);
      if (!contactMobId) continue;

      const direction = call.contact_called ? 'Called them' : 'They called';
      const body = `[Phone Call — ${call.called_at?.split(' ')[0] ?? 'unknown date'}] ${direction}\n\n${call.content ?? ''}`.trim();

      try {
        insertNote.run(generateId(), contactMobId, body, 0);
        result.calls++;
      } catch (e: any) {
        result.errors.push(`Call ${call.id}: ${e.message}`);
      }
    }

    // ── Step 7: Import activities ─────────────────────────
    const insertActivity = db.prepare(`
      INSERT INTO activities (id, user_id, type, title, description, occurred_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertParticipant = db.prepare(`
      INSERT OR IGNORE INTO activity_participants (activity_id, contact_id) VALUES (?, ?)
    `);

    for (const ma of data.activities) {
      const mobActivityId = generateId();
      const participants = activityParticipants.get(ma.id) ?? [];
      const resolvedParticipants = participants
        .map(pid => contactIdMap.get(pid))
        .filter((id): id is string => id != null);

      // Skip activities with no resolvable participants
      if (resolvedParticipants.length === 0) continue;

      try {
        insertActivity.run(
          mobActivityId, userId, 'in_person',
          ma.summary ?? 'Activity',
          ma.description ?? null,
          ma.happened_at ?? ma.created_at ?? new Date().toISOString(),
          ma.created_at ?? new Date().toISOString(),
          ma.created_at ?? new Date().toISOString(),
        );

        for (const pid of resolvedParticipants) {
          insertParticipant.run(mobActivityId, pid);
        }

        result.activities++;
      } catch (e: any) {
        result.errors.push(`Activity ${ma.id}: ${e.message}`);
      }
    }

    // ── Step 8: Import relationships ──────────────────────
    const insertRelationship = db.prepare(`
      INSERT OR IGNORE INTO relationships (id, contact_id, related_contact_id, relationship_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const seenRelationships = new Set<string>();

    for (const mr of data.relationships) {
      const contactMobId = contactIdMap.get(mr.contact_is);
      const relatedMobId = contactIdMap.get(mr.of_contact);
      if (!contactMobId || !relatedMobId) continue;

      const relType = relationshipTypeMap.get(mr.relationship_type_id);
      if (!relType) continue;

      const mobRelType = RELATIONSHIP_TYPE_MAP[relType.name] ?? relType.name;

      // Avoid duplicates (Monica stores both forward and inverse)
      const key = [contactMobId, relatedMobId, mobRelType].sort().join('|');
      if (seenRelationships.has(key)) continue;
      seenRelationships.add(key);

      try {
        insertRelationship.run(generateId(), contactMobId, relatedMobId, mobRelType);
        result.relationships++;
      } catch (e: any) {
        result.errors.push(`Relationship ${mr.id}: ${e.message}`);
      }
    }

    // ── Step 9: Import addresses ──────────────────────────
    const insertAddress = db.prepare(`
      INSERT INTO addresses (id, contact_id, label, street_line_1, city, state_province, postal_code, country, is_primary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `);

    for (const addr of data.addresses) {
      const contactMobId = contactIdMap.get(addr.contact_id);
      if (!contactMobId) continue;

      const place = placeMap.get(addr.place_id);
      if (!place) continue;

      try {
        insertAddress.run(
          generateId(), contactMobId, addr.name,
          place.street, place.city, place.province,
          place.postal_code, place.country,
        );
        result.addresses++;
      } catch (e: any) {
        result.errors.push(`Address ${addr.id}: ${e.message}`);
      }
    }

    // ── Step 10: Import life events ───────────────────────
    const insertLifeEvent = db.prepare(`
      INSERT INTO life_events (id, contact_id, event_type, title, description, occurred_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const le of data.lifeEvents) {
      const contactMobId = contactIdMap.get(le.contact_id);
      if (!contactMobId) continue;

      const leType = lifeEventTypeMap.get(le.life_event_type_id);
      let eventType = 'other';
      let title = le.name ?? 'Life event';

      if (leType) {
        // Get category for event_type
        const category = lifeEventCategoryMap.get(leType.life_event_category_id);
        if (category?.default_life_event_category_key) {
          eventType = LIFE_EVENT_CATEGORY_MAP[category.default_life_event_category_key] ?? 'other';
        }
        // Get title from type key if no name
        if (!le.name && leType.default_life_event_type_key) {
          title = LIFE_EVENT_TYPE_MAP[leType.default_life_event_type_key] ?? leType.default_life_event_type_key;
        } else if (!le.name && leType.name) {
          title = leType.name;
        }
      }

      try {
        insertLifeEvent.run(
          generateId(), contactMobId, eventType, title,
          le.note ?? null,
          le.happened_at?.split(' ')[0] ?? null,
        );
        result.lifeEvents++;
      } catch (e: any) {
        result.errors.push(`LifeEvent ${le.id}: ${e.message}`);
      }
    }

    // ── Step 11: Import gifts ─────────────────────────────
    const insertGift = db.prepare(`
      INSERT INTO gifts (id, contact_id, name, description, url, status, direction, date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    for (const mg of data.gifts) {
      const contactMobId = contactIdMap.get(mg.contact_id);
      if (!contactMobId) continue;

      // Map Monica gift status to Mob status
      let status = 'idea';
      if (mg.status === 'offered') status = 'given';
      else if (mg.status === 'idea') status = 'idea';

      try {
        insertGift.run(
          generateId(), contactMobId, mg.name,
          mg.comment, mg.url, status, 'giving',
          mg.date?.split(' ')[0] ?? null,
        );
        result.gifts++;
      } catch (e: any) {
        result.errors.push(`Gift ${mg.id}: ${e.message}`);
      }
    }

    // ── Step 12: Import reminders ─────────────────────────
    const insertReminder = db.prepare(`
      INSERT INTO reminders (id, contact_id, title, description, reminder_date, frequency, status, is_auto_generated, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', 0, datetime('now'), datetime('now'))
    `);

    for (const mr of data.reminders) {
      const contactMobId = contactIdMap.get(mr.contact_id);
      if (!contactMobId) continue;

      // Map Monica frequency to Mob frequency
      let frequency = 'one_time';
      if (mr.frequency_type === 'year') frequency = 'yearly';
      else if (mr.frequency_type === 'month') frequency = 'monthly';
      else if (mr.frequency_type === 'week') frequency = 'weekly';

      try {
        insertReminder.run(
          generateId(), contactMobId, mr.title,
          mr.description,
          mr.initial_date.split(' ')[0],
          frequency,
        );
        result.reminders++;
      } catch (e: any) {
        result.errors.push(`Reminder ${mr.id}: ${e.message}`);
      }
    }
  });

  importTransaction();
  return result;
}
