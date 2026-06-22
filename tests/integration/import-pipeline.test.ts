import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runImportPipeline, type NormalizedContact } from '../../src/services/import-pipeline.js';
import { PlanService } from '../../src/services/plans.js';
import { ContactService } from '../../src/services/contacts.js';
import { ContactMethodService } from '../../src/services/contact-methods.js';
import { NoteService } from '../../src/services/notes.js';
import { AddressService } from '../../src/services/addresses.js';
import { TagService } from '../../src/services/tags-groups.js';
import { createTestDatabase, createTestUser } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('runImportPipeline', () => {
  let db: Database.Database;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    userId = createTestUser(db);
  });

  afterEach(() => closeDatabase(db));

  const sample = (overrides: Partial<NormalizedContact> = {}): NormalizedContact => ({
    first_name: 'Sam',
    last_name: 'Rivers',
    company: 'Initech',
    methods: [{ type: 'email', value: 'sam@initech.com' }],
    addresses: [{ city: 'Austin', state_province: 'TX' }],
    notes: ['A note'],
    tags: ['Work'],
    ...overrides,
  });

  it('creates contacts and all sub-entities, returning per-entity counts', () => {
    const summary = runImportPipeline(db, userId, [sample()]);
    expect(summary.created).toBe(1);
    expect(summary.per_entity).toEqual({ contacts: 1, methods: 1, addresses: 1, notes: 1, tags: 1 });

    const contacts = new ContactService(db);
    const list = contacts.list(userId);
    expect(list.total).toBe(1);
    const id = list.data[0].id;
    expect(new ContactMethodService(db).listByContact(id)).toHaveLength(1);
    expect(new AddressService(db).listByContact(id)).toHaveLength(1);
    expect(new NoteService(db).listByContact(userId, id).total).toBe(1);
    expect(new TagService(db).listByContact(id)).toHaveLength(1);
  });

  it('skips a record that duplicates one imported earlier in the batch', () => {
    const summary = runImportPipeline(db, userId, [sample(), sample()]);
    expect(summary.created).toBe(1);
    expect(summary.skipped_duplicate).toBe(1);
  });

  it('detects duplicates by name + shared email against existing contacts', () => {
    runImportPipeline(db, userId, [sample()]);
    // Same name, same email → duplicate
    const summary = runImportPipeline(db, userId, [sample({ tags: ['Other'] })]);
    expect(summary.created).toBe(0);
    expect(summary.skipped_duplicate).toBe(1);
  });

  it('treats different people with the same name but different emails as distinct', () => {
    runImportPipeline(db, userId, [sample()]);
    const summary = runImportPipeline(db, userId, [
      sample({ methods: [{ type: 'email', value: 'different@x.com' }] }),
    ]);
    expect(summary.created).toBe(1);
    expect(summary.skipped_duplicate).toBe(0);
  });

  it('does not enforce quota on a hosted free user during beta', () => {
    db.prepare("UPDATE users SET plan='free' WHERE id=?").run(userId);
    const planService = new PlanService(db, true);

    const records: NormalizedContact[] = [];
    for (let i = 0; i < 15; i++) {
      records.push({ first_name: `Person${i}`, last_name: 'Q' });
    }

    const summary = runImportPipeline(db, userId, records, { planService });
    expect(summary.created).toBe(15);
    expect(summary.skipped_quota).toBe(0);
    expect(summary.warnings).toHaveLength(0);
  });

  it('does not enforce quota when no planService is passed', () => {
    db.prepare("UPDATE users SET plan='free' WHERE id=?").run(userId);
    const records: NormalizedContact[] = [];
    for (let i = 0; i < 15; i++) records.push({ first_name: `P${i}`, last_name: 'Z' });
    const summary = runImportPipeline(db, userId, records);
    expect(summary.created).toBe(15);
    expect(summary.skipped_quota).toBe(0);
  });
});
