/**
 * Minimal, hand-crafted import fixtures for the Import E2E spec.
 *
 * These are deliberately tiny strings that exercise each parser's happy path
 * (src/services/import-vcard.ts, import-google-csv.ts, monica-parser.ts). Names
 * are injected by the caller so each test can use a unique contact and assert
 * it later shows up in the contacts list.
 */

/** A single-contact vCard 3.0 record. */
export function vcardSample(first: string, last: string, email: string): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${first} ${last}`,
    `N:${last};${first};;;`,
    `EMAIL;TYPE=INTERNET:${email}`,
    'END:VCARD',
    '',
  ].join('\r\n');
}

/** A single-row Google Contacts CSV using the canonical export header. */
export function googleCsvSample(first: string, last: string, email: string): string {
  const header = 'Name,Given Name,Family Name,Nickname,Birthday,Organization 1 - Name,E-mail 1 - Value';
  const row = `"${first} ${last}","${first}","${last}",,,,"${email}"`;
  return `${header}\n${row}\n`;
}

/**
 * A tiny Monica CRM SQL export snippet. The real export is multi-MB; the parser
 * (src/services/monica-parser.ts) keys off `INSERT IGNORE INTO \`<table>\``
 * statements, so a single non-partial `contacts` row is enough to import one
 * contact. Must be >=100 chars and contain `INSERT` to pass the API guard.
 */
export function monicaSqlSample(first: string, last: string): string {
  return [
    '-- Monica CRM SQL export (minimal test fixture)',
    'INSERT IGNORE INTO `contacts` (`id`, `first_name`, `last_name`, `nickname`, `is_partial`, `is_active`, `is_dead`, `is_starred`) VALUES',
    `(1, '${first}', '${last}', NULL, 0, 1, 0, 0);`,
    '',
  ].join('\n');
}
