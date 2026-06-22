import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';

/**
 * E2E: Data export & statistics (/app/data).
 *
 * 1. Seed deterministic data via the internal API and assert the statistics
 *    tiles on /app/data reflect the exact seeded counts.
 * 2. Trigger the JSON export and capture the real browser download.
 *
 * Download capture note: DataExport.download() fetches /web/api/export, wraps
 * the text in a Blob, and clicks a synthetic `<a download>`. In Chromium that
 * blob+download attribute fires a genuine `download` event, so we capture it
 * with `page.waitForEvent('download')` and read the saved file. The endpoint
 * uses the `sendData` envelope, so the downloaded document is `{ data: {...} }`
 * with `contacts` and `version` nested under `data`.
 */

test('statistics reflect seeded data and export contains contacts + version', async ({ page, seeder }) => {
  // ─── Seed deterministic data ──────────────────────────────────────────────
  // 3 contacts; archive 1 so active=2, archived=1; favorite 1.
  const c1 = await seeder.createContact({ first_name: 'Ada', last_name: 'Lovelace', is_favorite: true });
  const c2 = await seeder.createContact({ first_name: 'Alan', last_name: 'Turing' });
  const c3 = await seeder.createContact({ first_name: 'Grace', last_name: 'Hopper' });

  // Archive one contact → active 2, archived 1.
  await seeder.patch(`/contacts/${c3.id}`, { status: 'archived' });

  // Two notes on the first contact.
  await seeder.post('/notes', { contact_id: c1.id, body: 'First note' });
  await seeder.post('/notes', { contact_id: c1.id, body: 'Second note' });

  // ─── Statistics tiles reflect the seeded counts ───────────────────────────
  // Every fresh account has 1 auto-created self-contact (is_me, active, not a
  // favourite) that is counted in the statistics and included in the export. So
  // the totals are seeded + 1: contacts 4, active 3 (2 seeded active + self),
  // archived 1, favourites 1, notes 2 (notes are on contacts only).
  await page.goto('/app/data');
  await expect(page.getByRole('heading', { name: 'Data & export' })).toBeVisible();

  await expect(page.getByTestId('stat-contacts-num')).toHaveText('4');
  await expect(page.getByTestId('stat-active-num')).toHaveText('3');
  await expect(page.getByTestId('stat-archived-num')).toHaveText('1');
  await expect(page.getByTestId('stat-favorites-num')).toHaveText('1');
  await expect(page.getByTestId('stat-notes-num')).toHaveText('2');

  // ─── Trigger export & capture the download ────────────────────────────────
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-download').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^mob-crm-export-\d{4}-\d{2}-\d{2}\.json$/);

  const path = await download.path();
  expect(path).toBeTruthy();
  const raw = await readFile(path!, 'utf8');
  const parsed = JSON.parse(raw);

  // The export is delivered via the `sendData` envelope: { data: { ... } }.
  const doc = parsed.data ?? parsed;
  expect(doc).toHaveProperty('version');
  expect(typeof doc.version).toBe('string');
  expect(Array.isArray(doc.contacts)).toBe(true);
  // The export contains the 3 seeded contacts plus the account's self-contact.
  expect(doc.contacts.length).toBe(4);

  const names = doc.contacts.map((c: { first_name: string }) => c.first_name);
  // The three seeded first names are all present (the 4th is the self-contact).
  expect(names).toEqual(expect.arrayContaining(['Ada', 'Alan', 'Grace']));
});
