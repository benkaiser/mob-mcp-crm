import { test, expect } from './fixtures';

test('Settings links to Activity log and lists entries after creating a contact', async ({ page, seeder }) => {
  const contact = await seeder.createContact({ first_name: `Audit ${Date.now()}` });

  await page.getByTestId('nav-settings').click();
  await page.waitForURL('**/app/settings');
  await expect(page.getByTestId('settings-activity-log')).toBeVisible();
  await page.getByTestId('settings-activity-log-link').click();

  await page.waitForURL('**/app/activity-log');
  await expect(page.getByTestId('activity-log-page')).toBeVisible();
  await expect(page.getByTestId('activity-log-row').first()).toContainText('create');
  await expect(page.getByTestId('activity-log-row').filter({ hasText: contact.id })).toBeVisible();
});

test('Dashboard shows the streak card', async ({ page, seeder }) => {
  await seeder.createContact({ first_name: `Streak ${Date.now()}` });
  await page.reload();
  await page.waitForURL('**/app/**');

  await expect(page.getByTestId('dashboard-streak-card')).toBeVisible();
  await expect(page.getByTestId('dashboard-streak-number')).toContainText('day streak');
  await expect(page.getByTestId('dashboard-streak-day')).toHaveCount(7);
  await expect(page.getByTestId('dashboard-streak-day').last()).toHaveAttribute('data-active', 'true');
});
