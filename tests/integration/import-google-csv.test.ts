import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGoogleCsv } from '../../src/services/import-google-csv.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, '../fixtures/import', name), 'utf-8');

describe('parseGoogleCsv', () => {
  it('parses rows into normalized contacts', () => {
    const contacts = parseGoogleCsv(fixture('google-contacts.csv'));
    expect(contacts).toHaveLength(3);

    const alice = contacts[0];
    expect(alice.first_name).toBe('Alice');
    expect(alice.last_name).toBe('Brown');
    expect(alice.nickname).toBe('Ali');
    expect(alice.company).toBe('Acme Corp');
    expect(alice.job_title).toBe('Engineer');
    expect(alice.birthday).toEqual({ mode: 'full_date', date: '1990-07-21' });
    expect(alice.notes).toEqual(['Likes hiking, and coffee']);
  });

  it('maps multiple email columns and phone with labels', () => {
    const [alice] = parseGoogleCsv(fixture('google-contacts.csv'));
    const emails = alice.methods!.filter((m) => m.type === 'email');
    expect(emails.map((e) => e.value)).toEqual(['alice@acme.com', 'alice.b@example.com']);
    const phone = alice.methods!.find((m) => m.type === 'phone');
    expect(phone!.value).toBe('+1 555-222-3333');
  });

  it('parses address fields and quoted street with comma', () => {
    const [alice] = parseGoogleCsv(fixture('google-contacts.csv'));
    expect(alice.addresses![0]).toMatchObject({
      city: 'Springfield',
      state_province: 'IL',
      postal_code: '62704',
      country: 'USA',
    });
    expect(alice.addresses![0].street_line_1).toBe('123 Main St, Apt 4');
  });

  it('splits multi-value cells joined by ":::" and maps Labels to tags', () => {
    const contacts = parseGoogleCsv(fixture('google-contacts.csv'));
    expect(contacts[0].tags).toEqual(['Friends', 'Work']);

    const bob = contacts[1];
    const emails = bob.methods!.filter((m) => m.type === 'email').map((m) => m.value);
    expect(emails).toEqual(['bob@globex.com', 'bob.carter@personal.com']);
    expect(bob.birthday).toEqual({ mode: 'month_day', month: 3, day: 14 });
  });

  it('filters system labels like "My Contacts" and parses quoted Name with comma', () => {
    const contacts = parseGoogleCsv(fixture('google-contacts.csv'));
    const carol = contacts[2];
    expect(carol.first_name).toBe('Carol');
    expect(carol.tags).toEqual(['Book Club']);
  });

  it('returns empty array for header-only or empty input', () => {
    expect(parseGoogleCsv('')).toEqual([]);
    expect(parseGoogleCsv('Name,Given Name\n')).toEqual([]);
  });

  it('folds Additional Name (middle name) into first_name (no separate middle_name field)', () => {
    const csv = [
      'Name,Given Name,Additional Name,Family Name',
      'John Jeffery Doe,John,Jeffery,Doe',
      '',
    ].join('\n');

    const [contact] = parseGoogleCsv(csv);
    expect(contact.first_name).toBe('John Jeffery');
    expect(contact.last_name).toBe('Doe');
  });
});
