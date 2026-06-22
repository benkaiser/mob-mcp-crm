import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseVCard } from '../../src/services/import-vcard.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, '../fixtures/import', name), 'utf-8');

describe('parseVCard', () => {
  it('parses multiple vcards from one file with core fields', () => {
    const contacts = parseVCard(fixture('apple.vcf'));
    expect(contacts).toHaveLength(2);

    const john = contacts[0];
    expect(john.first_name).toBe('John');
    expect(john.last_name).toBe('Appleseed');
    expect(john.nickname).toBe('Johnny');
    expect(john.company).toBe('Apple Inc.');
    expect(john.job_title).toBe('Product Manager');
    expect(john.birthday).toEqual({ mode: 'full_date', date: '1980-04-15' });
  });

  it('maps multiple emails and phones with labels', () => {
    const [john] = parseVCard(fixture('apple.vcf'));
    const emails = john.methods!.filter((m) => m.type === 'email');
    expect(emails.map((e) => e.value)).toEqual(['john@apple.com', 'john.home@example.com']);
    const phones = john.methods!.filter((m) => m.type === 'phone');
    expect(phones).toHaveLength(2);
    const website = john.methods!.find((m) => m.type === 'website');
    expect(website?.value).toBe('https://johnappleseed.example.com');
  });

  it('maps ADR, NOTE and CATEGORIES', () => {
    const [john] = parseVCard(fixture('apple.vcf'));
    expect(john.addresses![0]).toMatchObject({
      city: 'Cupertino',
      state_province: 'CA',
      postal_code: '95014',
      country: 'USA',
    });
    expect(john.addresses![0].street_line_1).toContain('1 Infinite Loop');
    expect(john.notes).toEqual(['Met at WWDC.']);
    expect(john.tags).toEqual(['Friends', 'Tech']);
  });

  it('parses vCard 4.0 month-day birthday (--MM-DD)', () => {
    const contacts = parseVCard(fixture('apple.vcf'));
    const jane = contacts[1];
    expect(jane.first_name).toBe('Jane');
    expect(jane.birthday).toEqual({ mode: 'month_day', month: 12, day: 25 });
  });

  it('unfolds folded NOTE lines and ignores embedded PHOTO', () => {
    const contacts = parseVCard(fixture('edge-cases.vcf'));
    const folded = contacts.find((c) => c.first_name === 'Folded');
    expect(folded).toBeDefined();
    expect(folded!.notes![0]).toContain('reassembled into one single continuous string');
    // PHOTO must not leak into any field
    const serialized = JSON.stringify(folded);
    expect(serialized).not.toContain('/9j/');
  });

  it('derives name from FN when N is missing/empty, and maps WHATSAPP', () => {
    const contacts = parseVCard(fixture('edge-cases.vcf'));
    const onlyLast = contacts.find((c) => c.first_name === 'OnlyLast');
    expect(onlyLast).toBeDefined();

    const mary = contacts.find((c) => c.first_name === 'Mary');
    expect(mary!.methods![0].type).toBe('whatsapp');
    expect(mary!.tags).toEqual(['Family']);
  });

  it('tolerates empty input', () => {
    expect(parseVCard('')).toEqual([]);
  });
});
