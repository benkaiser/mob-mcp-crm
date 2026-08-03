import { test, expect } from './fixtures';
import { test as base } from '@playwright/test';
import { registerAccount, loginAs, freshAccount } from './fixtures';

/**
 * Smoke test - proves the harness works end to end:
 *   1. A fresh account can be registered through the real server flow.
 *   2. Registration auto-logs-in and lands on the SPA dashboard.
 *   3. The shell nav + sidebar user render.
 *   4. The ApiSeeder can create + read data via the internal JSON API.
 */

test('registered account lands on the SPA dashboard with nav', async ({ page, account }) => {
  // `account` fixture already registered + navigated to /app/.
  await expect(page).toHaveURL(/\/app\//);
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
  await expect(page.getByTestId('nav-contacts')).toBeVisible();
  await expect(page.getByTestId('nav-settings')).toBeVisible();
  await expect(page.getByTestId('sidebar-user-name')).toContainText(account.name);
  await expect(page.getByTestId('logout-link')).toBeVisible();
});

test('ApiSeeder can create and read a contact', async ({ seeder }) => {
  const created = await seeder.createContact({ first_name: 'Smoke', last_name: 'Test' });
  expect(created.id).toBeTruthy();
  const fetched = await seeder.get<{ first_name: string }>(`/contacts/${created.id}`);
  expect(fetched.first_name).toBe('Smoke');
});

// Use the base test (no auto-registration) for the full register→login→logout loop.
base('register, then log out, then log back in', async ({ page }) => {
  const account = freshAccount('loop');
  await registerAccount(page, account);
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();

  // Log out via the server-rendered logout link → lands on /web/login.
  await page.getByTestId('logout-link').click();
  await page.waitForURL('**/web/login**');

  // Log back in with the same credentials.
  await loginAs(page, account);
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
});
