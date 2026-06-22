import { test, expect } from './fixtures';

/**
 * Navigation, dashboard & not-found E2E (bean mob-crm-uj8b).
 *
 * Covers:
 *   1. Dashboard summary counts render and reflect seeded data.
 *   2. Every sidebar nav link routes to the right URL + gets the active class.
 *   3. Unknown route → NotFound page.
 *   4. Deep-link to a contact profile (SPA history fallback) loads while authed.
 */

const ACTIVE = 'sidebar__link--active';

test.describe('Navigation, dashboard & not-found', () => {
  test('dashboard renders counts and reflects seeded data', async ({ page, seeder }) => {
    // Read the current Contacts count off the rendered tile.
    const contactsNum = page.getByTestId('dashboard-count-contacts-num');
    await expect(contactsNum).toBeVisible();
    const before = Number((await contactsNum.innerText()).trim());

    // The full set of count tiles should be present.
    for (const slug of [
      'contacts', 'favorites', 'activities', 'notes',
      'reminders', 'tasks', 'debts', 'gift-ideas',
    ]) {
      await expect(page.getByTestId(`dashboard-count-${slug}`)).toBeVisible();
    }

    // Seed a favorite contact + a pending task, then reload the dashboard.
    const contact = await seeder.createContact({
      first_name: 'Nav', last_name: 'Dash', is_favorite: true,
    });
    await seeder.post('/tasks', { contact_id: contact.id, title: 'Follow up', priority: 'high' });

    await page.reload();
    await expect(page.getByTestId('nav-dashboard')).toBeVisible();

    // Contacts count went up by exactly one; favorites + tasks now at least one.
    await expect(page.getByTestId('dashboard-count-contacts-num')).toHaveText(String(before + 1));
    await expect(Number((await page.getByTestId('dashboard-count-favorites-num').innerText()).trim()))
      .toBeGreaterThanOrEqual(1);
    await expect(Number((await page.getByTestId('dashboard-count-tasks-num').innerText()).trim()))
      .toBeGreaterThanOrEqual(1);
  });

  test('every sidebar nav link routes and highlights active', async ({ page }) => {
    const links: { testid: string; path: RegExp; activeClass?: string }[] = [
      { testid: 'nav-contacts', path: /\/app\/contacts$/ },
      // Duplicates is a sub-item revealed under the active Contacts section, so
      // it carries the sublink active class rather than the top-level one.
      { testid: 'subnav-duplicates', path: /\/app\/contacts\/duplicates$/, activeClass: 'sidebar__sublink--active' },
      { testid: 'nav-search', path: /\/app\/search$/ },
      { testid: 'nav-import', path: /\/app\/import$/ },
      { testid: 'nav-data', path: /\/app\/data$/ },
      { testid: 'nav-settings', path: /\/app\/settings$/ },
      { testid: 'nav-dashboard', path: /\/app\/$/ },
    ];

    for (const { testid, path, activeClass } of links) {
      const link = page.getByTestId(testid);
      await link.click();
      await expect(page).toHaveURL(path);
      await expect(link).toHaveClass(new RegExp(`\\b${activeClass ?? ACTIVE}\\b`));
    }
  });

  test('unknown route renders the NotFound page', async ({ page }) => {
    await page.goto('/app/does-not-exist');
    await expect(page.getByTestId('not-found')).toBeVisible();
    await expect(page.getByTestId('not-found')).toContainText('Page not found');
  });

  test('deep-link to a contact profile loads via SPA history fallback', async ({ page, seeder }) => {
    const contact = await seeder.createContact({ first_name: 'Deep', last_name: 'Link' });

    // Navigate the browser directly to the profile URL (server history fallback
    // should serve the SPA, which then renders the contact).
    await page.goto(`/app/contacts/${contact.id}`);
    await expect(page.getByTestId('nav-dashboard')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Deep Link/ })).toBeVisible();
  });
});
