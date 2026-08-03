import { test, expect } from './fixtures';

/**
 * Contacts CRUD E2E — exercises the real UI for the create/edit/delete/favourite
 * flows, and uses the ApiSeeder for bulk setup (pagination). Each test gets a
 * fresh, authenticated account via the `account` fixture, so tests are isolated.
 *
 * Page-scoped testids used here (added to the contacts page components):
 *   - contacts-list, contacts-row, contacts-row-name, contacts-new
 *   - contacts-search, contacts-filter-status, contacts-filter-favorite
 *   - contacts-sort-by, contacts-sort-order
 *   - contacts-pagination, contacts-page-prev, contacts-page-next, contacts-page-info
 *   - contact-form-first-name, contact-form-last-name, contact-form-company,
 *     contact-form-status, contact-form-favorite, contact-form-submit
 *   - profile-name, profile-work, favorite-toggle, contact-edit, contact-delete
 */

const unique = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

test('create a contact via the UI redirects to its profile', async ({ page }) => {
  const first = `Ada-${unique()}`;
  await page.goto('/app/contacts/new');

  await page.getByTestId('contact-form-first-name').fill(first);
  await page.getByTestId('contact-form-last-name').fill('Lovelace');
  await page.getByTestId('contact-form-work-toggle').click();
  await page.getByTestId('contact-form-company').fill('Analytical Engines');
  await page.getByTestId('contact-form-submit').click();

  // Redirected to /app/contacts/:id and the profile shows the new fields.
  await expect(page).toHaveURL(/\/app\/contacts\/[^/]+$/);
  await expect(page.getByTestId('profile-name')).toContainText(`${first} Lovelace`);
  await expect(page.getByTestId('profile-work')).toContainText('Analytical Engines');
});

test('list shows the new contact; search narrows; sort toggles', async ({ page, seeder }) => {
  const tag = unique();
  // Seed three deterministically-named contacts so we can assert search + sort.
  // Sort-by-name orders by LAST name then first, so give last names that sort
  // A < B < C to match the Alpha/Bravo/Charlie first names.
  await seeder.createContact({ first_name: `Alpha-${tag}`, last_name: 'Aaa' });
  await seeder.createContact({ first_name: `Bravo-${tag}`, last_name: 'Bbb' });
  await seeder.createContact({ first_name: `Charlie-${tag}`, last_name: 'Ccc' });

  await page.goto('/app/contacts');
  const rows = page.getByTestId('contacts-row');

  // All three are present.
  await expect(page.getByTestId('contacts-row-name').filter({ hasText: tag })).toHaveCount(3);

  // Search narrows results down to the single matching contact (debounced).
  await page.getByTestId('contacts-search').fill(`Bravo-${tag}`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(`Bravo-${tag}`);

  // Clear search, then sort by name and toggle order: first row flips.
  await page.getByTestId('contacts-search').fill(tag);
  await expect(page.getByTestId('contacts-row-name').filter({ hasText: tag })).toHaveCount(3);
  await page.getByTestId('contacts-sort-by').selectOption('name');

  await page.getByTestId('contacts-sort-order').selectOption('asc');
  const ascNames = page.getByTestId('contacts-row-name').filter({ hasText: tag });
  await expect(ascNames.first()).toContainText(`Alpha-${tag}`);

  await page.getByTestId('contacts-sort-order').selectOption('desc');
  const descNames = page.getByTestId('contacts-row-name').filter({ hasText: tag });
  await expect(descNames.first()).toContainText(`Charlie-${tag}`);
});

test('edit a contact via the UI persists on the profile', async ({ page, seeder }) => {
  const tag = unique();
  const { id } = await seeder.createContact({ first_name: `Edit-${tag}`, last_name: 'Before' });

  await page.goto(`/app/contacts/${id}`);
  await page.getByTestId('contact-edit').click();
  await expect(page).toHaveURL(new RegExp(`/app/contacts/${id}/edit$`));

  // Change last name + company, then save.
  await page.getByTestId('contact-form-last-name').fill('After');
  await page.getByTestId('contact-form-work-toggle').click();
  await page.getByTestId('contact-form-company').fill('NewCo');
  await page.getByTestId('contact-form-submit').click();

  // Back on the profile with persisted changes.
  await expect(page).toHaveURL(new RegExp(`/app/contacts/${id}$`));
  await expect(page.getByTestId('profile-name')).toContainText(`Edit-${tag} After`);
  await expect(page.getByTestId('profile-work')).toContainText('NewCo');
});

test('mark favourite and change status are reflected in list filters', async ({ page, seeder }) => {
  const tag = unique();
  const { id } = await seeder.createContact({ first_name: `Fav-${tag}`, last_name: 'Star' });
  // A second, non-favourite, active contact to prove the filter excludes it.
  await seeder.createContact({ first_name: `Plain-${tag}`, last_name: 'None' });

  // Mark favourite + archive via the edit form.
  await page.goto(`/app/contacts/${id}/edit`);
  await page.getByTestId('contact-form-favorite').check();
  await page.getByTestId('contact-form-status').selectOption('archived');
  await page.getByTestId('contact-form-submit').click();
  await expect(page).toHaveURL(new RegExp(`/app/contacts/${id}$`));

  await page.goto('/app/contacts');

  // Favourites-only filter shows just the starred contact.
  await page.getByTestId('contacts-filter-favorite').check();
  const favRows = page.getByTestId('contacts-row');
  await expect(favRows).toHaveCount(1);
  await expect(favRows.first()).toContainText(`Fav-${tag}`);
  await page.getByTestId('contacts-filter-favorite').uncheck();

  // Status filter: archived shows the archived contact; active excludes it.
  await page.getByTestId('contacts-filter-status').selectOption('archived');
  await expect(page.getByTestId('contacts-row')).toHaveCount(1);
  await expect(page.getByTestId('contacts-row').first()).toContainText(`Fav-${tag}`);

  await page.getByTestId('contacts-filter-status').selectOption('active');
  await expect(page.getByTestId('contacts-row-name').filter({ hasText: `Fav-${tag}` })).toHaveCount(0);
  await expect(page.getByTestId('contacts-row-name').filter({ hasText: `Plain-${tag}` })).toHaveCount(1);
});

test('toggle favourite directly from the contact profile header', async ({ page, seeder }) => {
  const tag = unique();
  const { id } = await seeder.createContact({ first_name: `Star-${tag}`, last_name: 'Toggle' });

  await page.goto(`/app/contacts/${id}`);
  const toggle = page.getByTestId('favorite-toggle');

  await expect(toggle).toHaveText('☆');
  await expect(toggle).toHaveAttribute('title', 'Add to favorites');

  await toggle.click();
  await expect(toggle).toHaveText('★');
  await expect(toggle).toHaveAttribute('title', 'Remove from favorites');
  await expect(page.getByTestId('profile-name')).toContainText('★ Favorite');
  await expect(page.getByTestId('toast').filter({ hasText: 'Added to favorites' })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('favorite-toggle')).toHaveText('★');

  await page.getByTestId('favorite-toggle').click();
  await expect(page.getByTestId('favorite-toggle')).toHaveText('☆');
  await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('title', 'Add to favorites');
  await expect(page.getByTestId('toast').filter({ hasText: 'Removed from favorites' })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('favorite-toggle')).toHaveText('☆');
});

test('profile renders approximate age as a derived years badge', async ({ page, seeder }) => {
  const tag = unique();
  const { id } = await seeder.createContact({
    first_name: `Age-${tag}`,
    birthday_mode: 'approximate_age',
    birthday_year_approximate: 10,
  });

  await page.goto(`/app/contacts/${id}`);

  await expect(page.getByTestId('badge').filter({ hasText: '~10 years' })).toBeVisible();
  await expect(page.getByTestId('badge').filter({ hasText: '~2016 yrs' })).toHaveCount(0);
});

test('delete a contact via the confirm dialog removes it from the list', async ({ page, seeder }) => {
  const tag = unique();
  const { id } = await seeder.createContact({ first_name: `Doomed-${tag}`, last_name: 'Soon' });

  await page.goto(`/app/contacts/${id}`);
  await page.getByTestId('contact-delete').click();

  // Confirm dialog appears; accept it.
  await expect(page.getByTestId('modal')).toBeVisible();
  await page.getByTestId('confirm-accept').click();

  // Redirected back to the list and the contact is gone.
  await expect(page).toHaveURL(/\/app\/contacts$/);
  await expect(page.getByTestId('contacts-row-name').filter({ hasText: `Doomed-${tag}` })).toHaveCount(0);
});

test('pagination controls appear and navigate when seeded past one page', async ({ page, seeder }) => {
  // List page size is 25; seed 30 to force a second page. Note: every fresh
  // account already has 1 auto-created self-contact (is_me) that appears in the
  // list, so the real total is 31 → page 1 = 25 rows, page 2 = 6 rows.
  const tag = unique();
  for (let i = 0; i < 30; i++) {
    await seeder.createContact({ first_name: `Page-${tag}`, last_name: String(i).padStart(2, '0') });
  }

  await page.goto('/app/contacts');

  // Pagination renders, first page is full (25 rows), and we start on page 1.
  await expect(page.getByTestId('contacts-pagination')).toBeVisible();
  await expect(page.getByTestId('contacts-page-info')).toContainText('Page 1 of 2');
  await expect(page.getByTestId('contacts-row')).toHaveCount(25);
  await expect(page.getByTestId('contacts-page-prev')).toBeDisabled();

  // Go to page 2: remaining rows (30 seeded + 1 self-contact − 25 = 6), Next
  // disabled, Prev enabled.
  await page.getByTestId('contacts-page-next').click();
  await expect(page.getByTestId('contacts-page-info')).toContainText('Page 2 of 2');
  await expect(page.getByTestId('contacts-row')).toHaveCount(6);
  await expect(page.getByTestId('contacts-page-next')).toBeDisabled();
  await expect(page.getByTestId('contacts-page-prev')).toBeEnabled();
});
