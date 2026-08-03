import { test, expect, type ApiSeeder } from './fixtures';

const ts = () => Date.now().toString(36);

interface SeededEntity {
  resource: 'activities' | 'notes' | 'reminders' | 'tasks' | 'debts' | 'gifts';
  id: string;
  title: string;
}

async function seedOverviewSet(seeder: ApiSeeder): Promise<SeededEntity[]> {
  const suffix = ts();
  const contact = await seeder.createContact({ first_name: `Overview${suffix}` });
  const activity = await seeder.post<{ id: string }>('/activities', {
    type: 'in_person',
    title: `Overview activity ${suffix}`,
    occurred_at: '2026-05-01T10:00:00.000Z',
    participant_contact_ids: [contact.id],
  });
  const note = await seeder.post<{ id: string }>('/notes', {
    contact_id: contact.id,
    title: `Overview note ${suffix}`,
    body: 'Remember this from the overview spec',
  });
  const reminder = await seeder.post<{ id: string }>('/reminders', {
    contact_id: contact.id,
    title: `Overview reminder ${suffix}`,
    reminder_date: '2026-06-01',
    frequency: 'one_time',
  });
  const task = await seeder.post<{ id: string }>('/tasks', {
    contact_id: contact.id,
    title: `Overview task ${suffix}`,
  });
  const debt = await seeder.post<{ id: string }>('/debts', {
    contact_id: contact.id,
    amount: 12.5,
    direction: 'they_owe_me',
    reason: `Overview debt ${suffix}`,
  });
  const gift = await seeder.post<{ id: string }>('/gifts', {
    contact_id: contact.id,
    name: `Overview gift ${suffix}`,
    direction: 'giving',
  });

  return [
    { resource: 'activities', id: activity.id, title: `Overview activity ${suffix}` },
    { resource: 'notes', id: note.id, title: `Overview note ${suffix}` },
    { resource: 'reminders', id: reminder.id, title: `Overview reminder ${suffix}` },
    { resource: 'tasks', id: task.id, title: `Overview task ${suffix}` },
    { resource: 'debts', id: debt.id, title: `Overview debt ${suffix}` },
    { resource: 'gifts', id: gift.id, title: `Overview gift ${suffix}` },
  ];
}

test.describe('entity overview pages', () => {
  test('each overview renders rows and row links navigate to detail', async ({ page, seeder }) => {
    const entities = await seedOverviewSet(seeder);

    for (const entity of entities) {
      await page.goto(`/app/${entity.resource}`);
      await expect(page.getByTestId(`overview-${entity.resource}`)).toBeVisible();
      await expect(page.getByTestId(`overview-new-${entity.resource}`)).toBeVisible();
      const row = page.getByTestId('overview-row').filter({ hasText: entity.title }).first();
      await expect(row).toBeVisible();
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/app/${entity.resource}/${entity.id}$`));
      await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', entity.resource);
    }
  });

  test('gift overview New flow creates a gift through ContactPicker', async ({ page, seeder }) => {
    const suffix = ts();
    await seeder.createContact({ first_name: `GiftPicker${suffix}` });

    await page.goto('/app/gifts');
    await page.getByTestId('overview-new-gifts').click();
    await expect(page.getByTestId('page-new-gift')).toBeVisible();
    await page.getByTestId('contact-picker-search').fill(`GiftPicker${suffix}`);
    await page.getByTestId('contact-picker-row').filter({ hasText: `GiftPicker${suffix}` }).click();
    await page.getByTestId('new-gift-name').fill(`Picker gift ${suffix}`);
    await page.getByTestId('new-gift-occasion').fill('Birthday');
    await page.getByTestId('new-gift-submit').click();

    await expect(page).toHaveURL(/\/app\/gifts\/.+$/);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'gifts');
    await expect(page.getByTestId('entity-field-title')).toContainText(`Picker gift ${suffix}`);
  });

  test('debt overview New flow creates a debt through ContactPicker', async ({ page, seeder }) => {
    const suffix = ts();
    await seeder.createContact({ first_name: `DebtPicker${suffix}` });

    await page.goto('/app/debts');
    await page.getByTestId('overview-new-debts').click();
    await expect(page.getByTestId('page-new-debt')).toBeVisible();
    await page.getByTestId('contact-picker-search').fill(`DebtPicker${suffix}`);
    await page.getByTestId('contact-picker-row').filter({ hasText: `DebtPicker${suffix}` }).click();
    await page.getByTestId('new-debt-amount').fill('42.50');
    await page.getByTestId('new-debt-reason').fill(`Picker debt ${suffix}`);
    await page.getByTestId('new-debt-submit').click();

    await expect(page).toHaveURL(/\/app\/debts\/.+$/);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'debts');
    await expect(page.getByTestId('entity-field-title')).toContainText(`Picker debt ${suffix}`);
  });
});
