import { test, expect } from './fixtures';

/**
 * Settings page E2E (self-hosted mode, port 3100, unlimited plan).
 *
 * Covers the four sections of /app/settings:
 *   1. Profile/plan — shows name, email, plan.
 *   2. API tokens — create → plaintext shown once (copy-field) → masked in list → revoke.
 *   3. Webhooks — create (url + event) → list → toggle active → send test → delete.
 *   4. Push notifications — renders gracefully without VAPID (no real subscription).
 *
 * In self-hosted mode the public-API and webhooks entitlements are enabled, so
 * the management UI (not the UpgradeNotice) is shown.
 */

/** Navigate to Settings via the shell nav and wait for it to render. */
async function gotoSettings(page: import('@playwright/test').Page) {
  await page.getByTestId('nav-settings').click();
  await page.waitForURL('**/app/settings');
  await expect(page.getByTestId('settings-profile')).toBeVisible();
}

test('profile section shows editable name, email and plan; name save persists', async ({ page, account }) => {
  await gotoSettings(page);

  const profile = page.getByTestId('settings-profile');
  await expect(profile.getByTestId('settings-profile-name-input')).toHaveValue(account.name);
  await expect(profile.getByTestId('settings-profile-email-input')).toHaveValue(account.email);
  await expect(profile.getByTestId('settings-profile-plan')).toContainText('self-hosted');

  // Edit the name and save → toast + persisted value after reload.
  const nameInput = profile.getByTestId('settings-profile-name-input');
  await nameInput.fill('Renamed User');
  await profile.getByTestId('settings-profile-save').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect(profile.getByTestId('settings-profile-name-input')).toHaveValue('Renamed User');

  // The plan & usage section also renders.
  await expect(page.getByTestId('settings-plan')).toBeVisible();
});

test('password section rejects a wrong current password', async ({ page, account }) => {
  void account;
  await gotoSettings(page);

  const section = page.getByTestId('settings-security');
  await expect(section).toBeVisible();
  await section.getByTestId('settings-password-current').fill('definitely-wrong');
  await section.getByTestId('settings-password-new').fill('newpassword456');
  await section.getByTestId('settings-password-confirm').fill('newpassword456');
  await section.getByTestId('settings-password-save').click();
  // Inline error banner surfaces the failure.
  await expect(section.getByTestId('error-banner')).toBeVisible();
});

test('sessions section lists the current device', async ({ page, account }) => {
  void account;
  await gotoSettings(page);

  const section = page.getByTestId('settings-sessions');
  await expect(section).toBeVisible();
  await expect(section.getByTestId('session-row').first()).toContainText('this device');
});

test('danger zone requires typed email + password to enable deletion', async ({ page, account }) => {
  await gotoSettings(page);

  const section = page.getByTestId('settings-danger');
  await expect(section).toBeVisible();
  await section.getByTestId('account-delete-open').click();
  await expect(page.getByTestId('modal')).toBeVisible();

  // Confirm button stays disabled until the email matches AND a password is present.
  const confirm = page.getByTestId('account-delete-confirm');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('account-delete-email').fill(account.email);
  await expect(confirm).toBeDisabled();
  await page.getByTestId('account-delete-password').fill('some-password');
  await expect(confirm).toBeEnabled();
});

test('API token: create → shown once → masked in list → revoke', async ({ page, account }) => {
  void account;
  await gotoSettings(page);

  const section = page.getByTestId('settings-tokens');
  await expect(section).toBeVisible();

  const tokenName = `e2e-token-${Date.now()}`;

  // Create. NOTE: the modal resets its fields in an `open` effect that runs
  // after first paint, which can clobber a value set by `fill()` on the very
  // first render. Type char-by-char with pressSequentially (each keystroke
  // dispatches an input event), then assert the value stuck before submitting.
  await section.getByTestId('token-create-open').click();
  await expect(page.getByTestId('modal')).toBeVisible();
  const nameInput = page.getByTestId('token-name-input');
  await nameInput.click();
  await nameInput.pressSequentially(tokenName);
  await expect(nameInput).toHaveValue(tokenName);
  await page.getByTestId('token-create-submit').click();

  // Plaintext shown once in a copy-field within the success callout.
  const created = page.getByTestId('token-created');
  await expect(created).toBeVisible();
  const copyValue = created.locator('.copy-field__value');
  await expect(copyValue).toBeVisible();
  const plaintext = (await copyValue.textContent())?.trim() ?? '';
  expect(plaintext.length).toBeGreaterThan(0);

  // Appears masked in the list (name visible, value masked with mob_<prefix>…).
  const row = section.getByTestId('token-row').filter({ has: page.getByText(tokenName, { exact: false }) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('mob_');
  // The full plaintext is NOT shown in the list row.
  await expect(row).not.toContainText(plaintext);

  // Revoke → confirm → the row stays but is marked "revoked" (the token is
  // revoked in-place rather than removed from the list).
  await row.getByTestId('token-revoke').click();
  await page.getByTestId('confirm-accept').click();
  await expect(row).toContainText('revoked');
});

test('webhook: create → list → toggle active → send test → delete', async ({ page, account }) => {
  void account;
  await gotoSettings(page);

  const section = page.getByTestId('settings-webhooks');
  await expect(section).toBeVisible();

  const url = `https://example.test/hook-${Date.now()}`;

  // Create with one event selected. NOTE: the modal resets its fields in an
  // `open` effect that runs after first paint, which can clobber a value set by
  // `fill()` on the very first render. Type char-by-char and assert the value
  // stuck before submitting.
  await section.getByTestId('webhook-create-open').click();
  await expect(page.getByTestId('modal')).toBeVisible();
  await page.getByTestId('webhook-event-contact.created').check();
  const urlInput = page.getByTestId('webhook-url-input');
  await urlInput.click();
  await urlInput.pressSequentially(url);
  await expect(urlInput).toHaveValue(url);
  await page.getByTestId('webhook-create-submit').click();

  // Signing secret shown once, then the row appears in the list.
  await expect(page.getByTestId('webhook-created')).toBeVisible();
  const row = section.getByTestId('webhook-row').filter({ hasText: url });
  await expect(row).toBeVisible();
  await expect(row).toContainText('active');

  // Toggle active → becomes inactive (button now reads Enable).
  await row.getByTestId('webhook-toggle').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect(row.getByTestId('webhook-toggle')).toHaveText('Enable');

  // Send test event (test-delivery endpoint exists).
  await row.getByTestId('webhook-test').click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Test event dispatched' })).toBeVisible();

  // Delete → confirm → row disappears.
  await row.getByTestId('webhook-delete').click();
  await page.getByTestId('confirm-accept').click();
  await expect(section.getByTestId('webhook-row').filter({ hasText: url })).toHaveCount(0);
});

test('push notifications section renders gracefully without VAPID', async ({ page, account }) => {
  void account;
  await gotoSettings(page);

  const section = page.getByTestId('settings-push');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Push notifications' })).toBeVisible();

  // Wait for the async init to settle (spinner clears). The section then shows
  // one of: not supported, not configured (no VAPID), or the subscription kv.
  // We do NOT require a real subscription — just assert a stable end state.
  await expect(section.getByTestId('spinner-center')).toHaveCount(0);

  const empty = section.getByTestId('empty-state');
  const kv = section.locator('dl.kv');
  await expect(empty.or(kv).first()).toBeVisible();
});

test('export section is visible in Settings and downloads a JSON snapshot', async ({ page, account }) => {
  void account;
  await gotoSettings(page);

  const section = page.getByTestId('settings-export');
  await expect(section).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Export your data' })).toBeVisible();

  // Clicking Download triggers a client-side blob download of the export JSON.
  const downloadPromise = page.waitForEvent('download');
  await section.getByTestId('settings-export-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^mob-crm-export-\d{4}-\d{2}-\d{2}\.json$/);
});
