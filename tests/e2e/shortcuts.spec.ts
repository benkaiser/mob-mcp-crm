import { test, expect } from './fixtures';

/**
 * Keyboard shortcuts (Stripe-style) E2E.
 *
 * Covers the global shortcut layer:
 *   1. `?` opens the cheat-sheet overlay; Escape closes it.
 *   2. A single-key action (`c`) navigates to New contact.
 *   3. A `g`-prefix sequence (`g c`) navigates to Contacts.
 *   4. `/` focuses the global search box.
 *   5. Shortcuts are suppressed while typing in an input.
 *
 * The global keydown listener is attached by a Preact effect after the shell
 * mounts, so the very first keypress can race that subscription. Each test
 * anchors focus on the body and wraps the trigger in `toPass()` so the key is
 * re-sent until the listener is live - deterministic without arbitrary waits.
 */

test('? opens the shortcuts overlay and Escape closes it', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('shell-search-input')).toBeVisible();
  await page.evaluate(() => document.body.focus());

  const overlay = page.getByTestId('shortcuts-help');
  await expect(async () => {
    await page.keyboard.press('?');
    await expect(overlay).toBeVisible({ timeout: 500 });
  }).toPass();

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
});

test('single-key shortcut creates a new contact', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('shell-search-input')).toBeVisible();
  await page.evaluate(() => document.body.focus());

  await expect(async () => {
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/app\/contacts\/new$/, { timeout: 500 });
  }).toPass();
});

test('g-prefix sequence navigates to Contacts', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByTestId('shell-search-input')).toBeVisible();
  await page.evaluate(() => document.body.focus());

  await expect(async () => {
    await page.keyboard.press('g');
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/app\/contacts$/, { timeout: 500 });
  }).toPass();
});

test('slash focuses the global search box', async ({ page }) => {
  await page.goto('/app/');
  const search = page.getByTestId('shell-search-input');
  await expect(search).toBeVisible();
  await page.evaluate(() => document.body.focus());

  await expect(async () => {
    await page.keyboard.press('/');
    await expect(search).toBeFocused({ timeout: 500 });
  }).toPass();
});

test('shortcuts are suppressed while typing in an input', async ({ page }) => {
  await page.goto('/app/');
  const search = page.getByTestId('shell-search-input');
  await expect(search).toBeVisible();

  await search.focus();
  await search.type('c');
  // Typing `c` in the search box must not navigate away.
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(search).toHaveValue('c');
});
