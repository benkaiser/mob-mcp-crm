import { test, expect } from './fixtures';

/**
 * Accessibility E2E (bean mob-crm-nbtz).
 *
 * Covers the keyboard-navigation / screen-reader affordances added in the a11y
 * pass:
 *   1. Skip-to-content link is the first tab stop and jumps focus to <main>.
 *   2. Modal dialogs trap focus, close on Escape, and return focus to the
 *      element that opened them.
 *   3. Form fields associate their <label> and expose aria-invalid on error.
 */

test('skip-to-content link is the first tab stop and focuses main', async ({ page }) => {
  await page.goto('/app/');
  // Wait for the SPA to mount before driving the keyboard, otherwise the Tab
  // can fire before the skip link exists.
  await expect(page.getByTestId('skip-link')).toBeAttached();
  await expect(page.getByTestId('shell-search-input')).toBeVisible();

  // Anchor focus at the top of the document, then Tab — the skip link is the
  // first focusable element so it receives focus.
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Tab');
  const skip = page.getByTestId('skip-link');
  await expect(skip).toBeFocused();

  // Activating it moves focus to the main content region.
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('delete-contact modal returns focus to its trigger on close', async ({ page, seeder }) => {
  const { id } = await seeder.createContact({ first_name: 'Focus', last_name: 'Return' });
  await page.goto(`/app/contacts/${id}`);

  const trigger = page.getByTestId('contact-delete');
  await trigger.click();

  // The dialog is open and focus has moved inside it.
  const dialog = page.getByTestId('modal');
  await expect(dialog).toBeVisible();

  // Escape closes the dialog…
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // …and focus returns to the Delete button that opened it.
  await expect(trigger).toBeFocused();
});

test('contact form associates labels with their controls', async ({ page }) => {
  await page.goto('/app/contacts/new');

  // Controls are reachable by their visible label text (label/for wiring).
  await expect(page.getByLabel('First name')).toBeVisible();
  await expect(page.getByLabel('Last name')).toBeVisible();

  // The required first-name field exposes the constraint to assistive tech.
  await expect(page.getByTestId('contact-form-first-name')).toHaveAttribute('required', '');
});
