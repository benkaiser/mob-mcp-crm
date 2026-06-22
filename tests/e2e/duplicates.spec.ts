import { test, expect } from './fixtures';

/** Minimal shape of a contact list row (mirrors web/src/api/types Contact). */
interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  company: string | null;
}

/**
 * E2E: Duplicate detection & merge (bean mob-crm-8w2f).
 *
 * The detector (ContactService.findDuplicates) keys on, among other things,
 * an exact normalized first+last name match → reason "same name". We seed two
 * contacts sharing a unique surname token so they collide only with each other
 * (parallel-safe), then exercise the merge flow and the empty state.
 */

/** Unique surname token so seeded pairs never cross-detect across tests. */
function token(): string {
  return `Dup${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

test('seeded near-identical contacts surface as a pair with a reason', async ({ page, seeder }) => {
  const surname = token();
  await seeder.createContact({ first_name: 'Alex', last_name: surname });
  await seeder.createContact({ first_name: 'Alex', last_name: surname });

  await page.goto('/app/contacts/duplicates');

  const pair = page.getByTestId('duplicate-pair').filter({ hasText: surname });
  await expect(pair).toHaveCount(1);
  await expect(pair.getByTestId('duplicate-pair-reason')).toHaveText(/same name/i);
  await expect(pair.getByTestId('duplicate-pair-name-1')).toContainText(`Alex ${surname}`);
  await expect(pair.getByTestId('duplicate-pair-name-2')).toContainText(`Alex ${surname}`);
});

test('merging a pair combines them into one surviving contact with merged data', async ({ page, seeder }) => {
  const surname = token();
  // Primary keeps its name; secondary carries a company the primary lacks.
  await seeder.createContact({ first_name: 'Sam', last_name: surname });
  await seeder.createContact({ first_name: 'Sam', last_name: surname, company: 'Acme Co' });

  // Two non-deleted matches before merge.
  const before = await seeder.get<Contact[]>(`/contacts?search=${surname}`);
  expect(before).toHaveLength(2);

  await page.goto('/app/contacts/duplicates');
  const pair = page.getByTestId('duplicate-pair').filter({ hasText: surname });
  await expect(pair).toHaveCount(1);

  // Keep the first contact, then confirm the merge dialog.
  await pair.getByTestId('duplicate-pair-keep-1').click();
  await expect(page.getByTestId('modal')).toBeVisible();
  await page.getByTestId('confirm-accept').click();

  await expect(page.getByTestId('toast')).toContainText(/merged/i);

  // The pair is gone from the UI (only one contact remains).
  await expect(page.getByTestId('duplicate-pair').filter({ hasText: surname })).toHaveCount(0);

  // Exactly one survivor in the API, and the secondary's company was copied over.
  const after = await seeder.get<Contact[]>(`/contacts?search=${surname}`);
  expect(after).toHaveLength(1);
  expect(after[0].first_name).toBe('Sam');
  expect(after[0].last_name).toBe(surname);
  expect(after[0].company).toBe('Acme Co');
});

test('a fresh account with distinct contacts shows the empty state', async ({ page, seeder }) => {
  const stamp = token();
  await seeder.createContact({ first_name: `Unique${stamp}A`, last_name: `${stamp}A` });
  await seeder.createContact({ first_name: `Unique${stamp}B`, last_name: `${stamp}B` });

  await page.goto('/app/contacts/duplicates');

  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('empty-state')).toContainText(/no duplicates/i);
  await expect(page.getByTestId('duplicate-pair')).toHaveCount(0);
});
