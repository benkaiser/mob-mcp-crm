import { test, expect } from './fixtures';
import { vcardSample, googleCsvSample, monicaSqlSample } from './fixtures/import-samples';

/**
 * E2E coverage for the three import sources on /app/import:
 *   - vCard:      paste .vcf → Preview count → Import → result counts → list.
 *   - Google CSV: paste CSV  → Import → result counts → list.
 *   - Monica CRM: paste tiny SQL → danger button → ConfirmDialog → accept/cancel.
 *
 * Text is pasted into the textarea (deterministic) rather than uploaded; one
 * vCard case also exercises the file input via setInputFiles for coverage.
 */

/** Unique, filesystem/CSV-safe token per test invocation. */
function uniq(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function gotoImport(page: import('@playwright/test').Page) {
  await page.goto('/app/import');
  await expect(page.getByTestId('tab-vcard')).toBeVisible();
}

/** Search the contacts list for `name` and assert at least one row matches. */
async function expectContactInList(page: import('@playwright/test').Page, name: string) {
  await page.goto('/app/contacts');
  await page.getByPlaceholder('Search contacts…').fill(name);
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
}

test('vCard: paste → preview → import → contact appears in list', async ({ page }) => {
  const first = uniq('Vee');
  const last = uniq('Card');
  const email = `${first.toLowerCase()}@example.test`;

  await gotoImport(page);
  await page.getByTestId('tab-vcard').click();
  await page.getByTestId('import-textarea').fill(vcardSample(first, last, email));

  // Preview shows a parsed count.
  await page.getByTestId('import-preview').click();
  await expect(page.getByTestId('import-preview-count')).toContainText('1 contact');

  // Import commits and renders the result counts.
  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-result')).toBeVisible();
  await expect(page.getByTestId('count-created-num')).toHaveText('1');

  await expectContactInList(page, `${first} ${last}`);
});

test('vCard: file input upload also works', async ({ page }) => {
  const first = uniq('Filed');
  const last = uniq('Vcf');
  const email = `${first.toLowerCase()}@example.test`;

  await gotoImport(page);
  await page.getByTestId('tab-vcard').click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'contact.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(vcardSample(first, last, email)),
  });
  // onFile populates the textarea from the file contents.
  await expect(page.getByTestId('import-textarea')).toHaveValue(/BEGIN:VCARD/);

  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('count-created-num')).toHaveText('1');
});

test('Google CSV: paste → import → contact appears in list', async ({ page }) => {
  const first = uniq('Goog');
  const last = uniq('Csv');
  const email = `${first.toLowerCase()}@example.test`;

  await gotoImport(page);
  await page.getByTestId('tab-google-csv').click();
  await page.getByTestId('import-textarea').fill(googleCsvSample(first, last, email));

  await page.getByTestId('import-submit').click();
  await expect(page.getByTestId('import-result')).toBeVisible();
  await expect(page.getByTestId('count-created-num')).toHaveText('1');

  await expectContactInList(page, `${first} ${last}`);
});

test('Monica: cancelling the confirm dialog aborts the import', async ({ page }) => {
  const first = uniq('Moni');
  const last = uniq('Cancel');

  await gotoImport(page);
  await page.getByTestId('tab-monica').click();
  await page.getByTestId('import-textarea').fill(monicaSqlSample(first, last));

  // Open the destructive confirm dialog, then cancel — no request should fire.
  let importFired = false;
  await page.route('**/web/api/import/monica', (route) => { importFired = true; route.abort(); });

  await page.getByTestId('import-monica-replace').click();
  await expect(page.getByTestId('confirm-accept')).toBeVisible();
  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('confirm-accept')).toBeHidden();

  // Give any erroneous request a beat to fire.
  await page.waitForTimeout(300);
  expect(importFired).toBe(false);
  await expect(page.getByTestId('monica-result')).toHaveCount(0);
});

test('Monica: confirm → destructive import → per-entity counts', async ({ page }) => {
  const first = uniq('Moni');
  const last = uniq('Import');

  await gotoImport(page);
  await page.getByTestId('tab-monica').click();
  await page.getByTestId('import-textarea').fill(monicaSqlSample(first, last));

  await page.getByTestId('import-monica-replace').click();
  await expect(page.getByTestId('confirm-accept')).toBeVisible();

  const [resp] = await Promise.all([
    page.waitForResponse('**/web/api/import/monica'),
    page.getByTestId('confirm-accept').click(),
  ]);
  expect(resp.ok()).toBe(true);

  await expect(page.getByTestId('monica-result')).toBeVisible();
  // Per-entity counts render; the single non-partial contact is imported.
  await expect(page.getByTestId('count-contacts-num')).toHaveText('1');

  // The destructive import replaced all data with just this contact.
  await expectContactInList(page, `${first} ${last}`);
});
