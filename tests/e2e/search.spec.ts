import { test, expect, freshAccount } from './fixtures';

/**
 * E2E: Global search (bean mob-crm-kwse).
 *
 * Covers:
 *   1. Topbar `shell-search-input` submit → navigates to /app/search?q=...
 *   2. Cross-entity matches (contact + note + activity sharing a keyword) grouped.
 *   3. No-results query → empty-state renders.
 *   4. Clicking a result navigates to the correct detail/profile route.
 *
 * Each test uses a distinctive keyword (derived from a fresh unique id) so that
 * results stay deterministic across parallel workers.
 */

/** A distinctive, search-safe token unique to this test invocation. */
function keyword(prefix: string): string {
  // freshAccount().email embeds Date.now()+pid+counter; strip to alphanumerics.
  const unique = freshAccount(prefix).email.split('@')[0].replace(/[^a-z0-9]/gi, '');
  return `Znk${unique}`;
}

test('topbar search submits and navigates to /app/search?q=...', async ({ page }) => {
  const term = keyword('navq');
  await page.getByTestId('shell-search-input').fill(term);
  await page.getByTestId('shell-search-input').press('Enter');

  await expect(page).toHaveURL(new RegExp(`/app/search\\?q=${term}`));
  await expect(page.getByTestId('search-input')).toHaveValue(term);
});

test('search returns grouped matches across entity types', async ({ page, seeder }) => {
  const term = keyword('multi');

  // Seed a contact whose name contains the keyword.
  const contact = await seeder.createContact({ first_name: term, last_name: 'Person' });
  // A note for that contact containing the keyword in its body.
  await seeder.post('/notes', { contact_id: contact.id, body: `Reminder about ${term} project` });
  // An activity containing the keyword in its title.
  await seeder.post('/activities', {
    type: 'in_person',
    title: `Lunch re ${term}`,
    occurred_at: '2026-01-15',
    participant_contact_ids: [contact.id],
  });

  await page.goto(`/app/search?q=${term}`);

  // Results load (debounced); wait for the rows.
  await expect(page.getByTestId('search-result-row').first()).toBeVisible();

  // Grouped by entity type — contacts, notes and activities groups all present.
  await expect(page.locator('[data-testid="search-result-group"][data-entity-type="contacts"]')).toBeVisible();
  await expect(page.locator('[data-testid="search-result-group"][data-entity-type="notes"]')).toBeVisible();
  await expect(page.locator('[data-testid="search-result-group"][data-entity-type="activities"]')).toBeVisible();

  // Each entity type contributed a matching row.
  await expect(page.locator('[data-testid="search-result-row"][data-entity-type="contacts"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="search-result-row"][data-entity-type="notes"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="search-result-row"][data-entity-type="activities"]')).toHaveCount(1);
});

test('no-results query renders the empty state', async ({ page }) => {
  const term = keyword('nomatch');
  await page.goto(`/app/search?q=${term}`);

  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('empty-state')).toContainText('No matches');
});

test('clicking a contact result navigates to the contact profile', async ({ page, seeder }) => {
  const term = keyword('click');
  const contact = await seeder.createContact({ first_name: term, last_name: 'Target' });

  await page.goto(`/app/search?q=${term}`);

  const row = page.locator('[data-testid="search-result-row"][data-entity-type="contacts"]');
  await expect(row).toBeVisible();
  await row.click();

  await expect(page).toHaveURL(new RegExp(`/app/contacts/${contact.id}$`));
});

test('search matches a "last first" name ordering via typeahead', async ({ page, seeder }) => {
  const first = keyword('order');
  await seeder.createContact({ first_name: first, last_name: 'Zephyr' });
  await page.goto(`/app/search?q=${encodeURIComponent(`Zephyr ${first}`)}`);
  const row = page.locator('[data-testid="search-result-row"][data-entity-type="contacts"]');
  await expect(row).toBeVisible();
});

test('typeahead supports arrow-key + Enter navigation', async ({ page, seeder }) => {
  // Two contacts sharing a keyword so the dropdown has multiple options.
  const term = keyword('kbd');
  const c1 = await seeder.createContact({ first_name: term, last_name: 'Aardvark' });
  await seeder.createContact({ first_name: term, last_name: 'Buffalo' });

  const input = page.getByTestId('shell-search-input');
  await input.click();
  await input.fill(term);

  // Wait for the dropdown to populate.
  await expect(page.getByTestId('shell-search-dropdown')).toBeVisible();
  await expect(page.getByTestId('shell-search-result').first()).toBeVisible();

  // ArrowDown highlights the first option (aria-selected=true).
  await input.press('ArrowDown');
  const firstOption = page.getByTestId('shell-search-result').first();
  await expect(firstOption).toHaveAttribute('aria-selected', 'true');

  // Enter on the highlighted option navigates to that contact (results are
  // ordered Aardvark before Buffalo, so the first option is c1).
  await input.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/app/contacts/${c1.id}$`));
});

test('typeahead Escape closes the dropdown', async ({ page, seeder }) => {
  const term = keyword('esc');
  await seeder.createContact({ first_name: term, last_name: 'Closer' });
  const input = page.getByTestId('shell-search-input');
  await input.click();
  await input.fill(term);
  await expect(page.getByTestId('shell-search-dropdown')).toBeVisible();
  await input.press('Escape');
  await expect(page.getByTestId('shell-search-dropdown')).toBeHidden();
});
