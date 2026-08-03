import { test, expect } from './fixtures';

/**
 * E2E: timeline entities (activities, notes, life-events, reminders, gifts,
 * debts, tasks). Each entity is seeded via the internal JSON API, opened on its
 * EntityDetail page at /app/<resource>/:id, then edited / deleted / completed
 * through the real SPA UI.
 *
 * Independent tests: each seeds its own base contact + entity with unique data.
 */

const ts = () => Date.now().toString(36);

test.describe('timeline entities', () => {
  test('activity: create, view, edit, delete', async ({ page, seeder }) => {
    const firstName = `Act${ts()}`;
    const contact = await seeder.createContact({ first_name: firstName });
    const activity = await seeder.post<{ id: string }>('/activities', {
      type: 'phone_call',
      title: `Call ${ts()}`,
      occurred_at: '2026-01-15T10:00:00.000Z',
      participant_contact_ids: [contact.id],
    });

    await page.goto(`/app/activities/${activity.id}`);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'activities');
    await expect(page.getByTestId('entity-field-type')).toContainText('Phone call');
    // The related participant contact is shown on the detail page.
    await expect(page.getByTestId('activity-participants')).toContainText(firstName);

    // Edit the title.
    const newTitle = `Edited call ${ts()}`;
    await page.getByTestId('entity-edit').click();
    await page.getByTestId('entity-edit-input').fill(newTitle);
    await page.getByTestId('entity-edit-save').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await expect(page.getByTestId('entity-field-title')).toContainText(newTitle);

    // Delete it → redirect to dashboard.
    await page.getByTestId('entity-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test('note: create, view, delete', async ({ page, seeder }) => {
    const contact = await seeder.createContact({ first_name: `Note${ts()}` });
    const note = await seeder.post<{ id: string }>('/notes', {
      contact_id: contact.id,
      body: `Note body ${ts()}`,
    });

    await page.goto(`/app/notes/${note.id}`);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'notes');
    await expect(page.getByTestId('entity-field-body')).toBeVisible();

    await page.getByTestId('entity-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test('life event: create, view, delete', async ({ page, seeder }) => {
    const contact = await seeder.createContact({ first_name: `Life${ts()}` });
    const event = await seeder.post<{ id: string }>('/life-events', {
      contact_id: contact.id,
      event_type: 'milestone',
      title: `Graduated ${ts()}`,
    });

    await page.goto(`/app/life-events/${event.id}`);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'life-events');
    await expect(page.getByTestId('entity-field-event_type')).toContainText('Milestone');

    await page.getByTestId('entity-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test('reminder: create, view, complete', async ({ page, seeder }) => {
    const contact = await seeder.createContact({ first_name: `Rem${ts()}` });
    const reminder = await seeder.post<{ id: string }>('/reminders', {
      contact_id: contact.id,
      title: `Follow up ${ts()}`,
      reminder_date: '2026-06-01',
      frequency: 'one_time',
    });

    await page.goto(`/app/reminders/${reminder.id}`);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'reminders');
    await expect(page.getByTestId('entity-field-status')).not.toContainText('Completed');

    // Complete it → status updates in place.
    await page.getByTestId('entity-complete').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await expect(page.getByTestId('entity-field-status')).toContainText('Completed');
  });

  test('gift: create, view, delete', async ({ page, seeder }) => {
    const contact = await seeder.createContact({ first_name: `Gift${ts()}` });
    const gift = await seeder.post<{ id: string }>('/gifts', {
      contact_id: contact.id,
      name: `Book ${ts()}`,
      direction: 'giving',
    });

    await page.goto(`/app/gifts/${gift.id}`);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'gifts');
    await expect(page.getByTestId('entity-field-direction')).toContainText('Giving');

    await page.getByTestId('entity-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test('debt: create, view, delete', async ({ page, seeder }) => {
    const contact = await seeder.createContact({ first_name: `Debt${ts()}` });
    const debt = await seeder.post<{ id: string }>('/debts', {
      contact_id: contact.id,
      amount: 42,
      direction: 'they_owe_me',
      reason: `Lunch ${ts()}`,
    });

    await page.goto(`/app/debts/${debt.id}`);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'debts');
    await expect(page.getByTestId('entity-field-direction')).toContainText('They owe me');

    await page.getByTestId('entity-delete').click();
    await page.getByTestId('confirm-accept').click();
    await expect(page).toHaveURL(/\/app\/$/);
  });

  test('task: create, view, complete', async ({ page, seeder }) => {
    const contact = await seeder.createContact({ first_name: `Task${ts()}` });
    const task = await seeder.post<{ id: string }>('/tasks', {
      contact_id: contact.id,
      title: `Buy gift ${ts()}`,
    });

    await page.goto(`/app/tasks/${task.id}`);
    await expect(page.getByTestId('entity-detail')).toHaveAttribute('data-resource', 'tasks');
    await expect(page.getByTestId('entity-field-status')).toContainText('Pending');

    // Complete it → status flips to completed in place.
    await page.getByTestId('entity-complete').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await expect(page.getByTestId('entity-field-status')).toContainText('Completed');
  });
});
