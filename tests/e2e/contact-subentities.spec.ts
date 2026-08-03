import { test, expect, type Page } from './fixtures';

/**
 * Contact sub-entity editors (mob-crm-t8po).
 *
 * Each test seeds its own base contact via the ApiSeeder, navigates to the
 * profile at /app/contacts/:id, and drives a single sub-entity editor through
 * the UI (add → assert visible → edit/remove → assert gone). Tests are
 * independent and use unique data.
 *
 * Section add/edit/delete controls live in ContactProfileView (owned by another
 * agent) and are addressed structurally via the section heading. The editor
 * modal fields + save/cancel carry page-scoped testids added to
 * SubEntityEditors.tsx.
 */

/** Locator for a profile section card, scoped by its <h2> heading. */
function section(page: Page, title: string) {
  return page.locator('.section', {
    has: page.getByRole('heading', { name: title, exact: true }),
  });
}

/** Seed a base contact and open its profile. */
async function openContact(page: Page, seeder: { createContact: (f: Record<string, unknown>) => Promise<{ id: string }> }, first: string) {
  const { id } = await seeder.createContact({ first_name: first });
  await page.goto(`/app/contacts/${id}`);
  await expect(page.getByRole('heading', { name: first })).toBeVisible();
  return id;
}

/** Confirm a "Remove" ConfirmDialog. */
async function confirmRemove(page: Page) {
  await page.getByTestId('confirm-accept').click();
}

test('contact methods: add, edit, delete', async ({ page, seeder }) => {
  await openContact(page, seeder, `Methods-${Date.now()}`);
  const sec = section(page, 'Contact methods');

  // Add
  await sec.getByRole('button', { name: '+ Add' }).click();
  await page.getByTestId('method-type').selectOption('phone');
  await page.getByTestId('method-value').fill('+15551230001');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText('+15551230001')).toBeVisible();

  // Edit
  await sec.getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('method-value').fill('+15559998888');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText('+15559998888')).toBeVisible();
  await expect(sec.getByText('+15551230001')).toHaveCount(0);

  // Delete
  await sec.getByRole('button', { name: 'Delete' }).click();
  await confirmRemove(page);
  await expect(sec.getByText('+15559998888')).toHaveCount(0);
});

test('addresses: add, edit, delete', async ({ page, seeder }) => {
  await openContact(page, seeder, `Address-${Date.now()}`);
  const sec = section(page, 'Addresses');

  // Add
  await sec.getByRole('button', { name: '+ Add' }).click();
  await page.getByTestId('address-label').fill('home');
  await page.getByTestId('address-street1').fill('100 First Ave');
  await page.getByTestId('address-city').fill('Springfield');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText('100 First Ave')).toBeVisible();

  // Edit
  await sec.getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('address-street1').fill('200 Second St');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText('200 Second St')).toBeVisible();
  await expect(sec.getByText('100 First Ave')).toHaveCount(0);

  // Delete
  await sec.getByRole('button', { name: 'Delete' }).click();
  await confirmRemove(page);
  await expect(sec.getByText('200 Second St')).toHaveCount(0);
});

test('custom fields: add, delete', async ({ page, seeder }) => {
  await openContact(page, seeder, `Custom-${Date.now()}`);
  const sec = section(page, 'Custom fields');

  // Add
  await sec.getByRole('button', { name: '+ Add' }).click();
  await page.getByTestId('cf-name').fill('Favourite colour');
  await page.getByTestId('cf-value').fill('Teal');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText('Favourite colour')).toBeVisible();
  await expect(sec.getByText('Teal')).toBeVisible();

  // Delete
  await sec.getByRole('button', { name: 'Delete' }).click();
  await confirmRemove(page);
  await expect(sec.getByText('Favourite colour')).toHaveCount(0);
});

test('food preferences: set then clear', async ({ page, seeder }) => {
  await openContact(page, seeder, `Food-${Date.now()}`);
  const sec = section(page, 'Food preferences');

  // Set
  await sec.getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('food-favorites').fill('Pizza, Ramen');
  await page.getByTestId('food-allergies').fill('Peanuts');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText('Pizza, Ramen')).toBeVisible();
  await expect(sec.getByText('Peanuts')).toBeVisible();

  // Clear
  await sec.getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('food-favorites').fill('');
  await page.getByTestId('food-allergies').fill('');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText('Pizza, Ramen')).toHaveCount(0);
  await expect(sec.getByText('Peanuts')).toHaveCount(0);
});

test('relationships: link then unlink another contact', async ({ page, seeder }) => {
  const stamp = Date.now();
  const relatedName = `Related-${stamp}`;
  await seeder.createContact({ first_name: relatedName });
  await openContact(page, seeder, `Primary-${stamp}`);
  const sec = section(page, 'Relationships');

  // Link
  await sec.getByRole('button', { name: '+ Add' }).click();
  await page.getByTestId('rel-contact').selectOption({ label: relatedName });
  await page.getByTestId('rel-type').selectOption('sibling');
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText(relatedName)).toBeVisible();
  await expect(sec.getByText('sibling')).toBeVisible();

  // Unlink
  await sec.getByRole('button', { name: 'Delete' }).click();
  await confirmRemove(page);
  await expect(sec.getByText(relatedName)).toHaveCount(0);
});

test('tags: add then remove', async ({ page, seeder }) => {
  const tagName = `tag-${Date.now()}`;
  await openContact(page, seeder, `Tagged-${Date.now()}`);
  const sec = section(page, 'Tags');

  // Add
  await sec.getByRole('button', { name: '+ Add' }).click();
  await page.getByTestId('tag-name').fill(tagName);
  await page.getByTestId('editor-save').click();
  await expect(sec.getByText(tagName)).toBeVisible();

  // Remove (the × button's visible text is "×"; it carries title="Remove tag").
  await sec.getByTitle('Remove tag').click();
  await confirmRemove(page);
  await expect(sec.getByText(tagName)).toHaveCount(0);
});
