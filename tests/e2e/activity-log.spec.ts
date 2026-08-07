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

test('Dashboard shows recently interacted contacts with a link to the activity log', async ({ page, seeder }) => {
  const name = `Recent ${Date.now()}`;
  const contact = await seeder.createContact({ first_name: name });
  // An activity against the contact is an interaction the audit log captures.
  await seeder.post('/activities', {
    type: 'in_person',
    title: `Coffee ${Date.now()}`,
    occurred_at: '2026-01-15T10:00:00.000Z',
    participant_contact_ids: [contact.id],
  });

  await page.reload();
  await page.waitForURL('**/app/**');

  const card = page.getByTestId('dashboard-recent-contacts');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('dashboard-recent-contact').filter({ hasText: name })).toBeVisible();

  // The row links to the contact profile.
  await card.getByTestId('dashboard-recent-contact').filter({ hasText: name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/contacts/${contact.id}$`));

  // The footer button navigates to the full activity log.
  await page.goBack();
  await page.getByTestId('dashboard-recent-contacts-log').click();
  await page.waitForURL('**/app/activity-log');
  await expect(page.getByTestId('activity-log-page')).toBeVisible();
});
