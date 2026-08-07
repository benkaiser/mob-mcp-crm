import { test as base } from '@playwright/test';
import { expect, registerAccount, loginAs, freshAccount } from './fixtures';

/**
 * Auth lifecycle E2E (bean mob-crm-4sxc).
 *
 * Drives the real Express auth routes (EJS forms at /auth/register + /web/login,
 * /web/logout) and the Preact SPA AuthGuard. Every test mints a unique account
 * via `freshAccount(...)` so parallel runs never collide. Logged-out flows use
 * the base `test` (no auto-registration); the extended `test` auto-registers.
 */

// 1. Register success → lands on /app/ dashboard, nav visible.
base('register success lands on the SPA dashboard with nav', async ({ page }) => {
  const account = freshAccount('reg');
  await registerAccount(page, account);

  await expect(page).toHaveURL(/\/app\//);
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
  await expect(page.getByTestId('nav-contacts')).toBeVisible();
  await expect(page.getByTestId('sidebar-user-name')).toContainText(account.name);
});

// 2. Register with an already-existing email → 409 error shown on register page.
base('registering a duplicate email re-renders the register page with an error', async ({ page }) => {
  const account = freshAccount('dup');
  // First registration succeeds and auto-logs-in.
  await registerAccount(page, account);

  // Start a clean, logged-out slate and attempt the same email again.
  await page.context().clearCookies();
  await page.goto('/auth/register?from=web');
  await page.locator('#name').fill(account.name);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/auth/register') && res.request().method() === 'POST',
    ),
    page.locator('button[type="submit"]').click(),
  ]);

  expect(response.status()).toBe(409);
  // Stays on the register page (no redirect into the SPA) and shows the error.
  await expect(page).not.toHaveURL(/\/app\//);
  await expect(page.locator('.error')).toBeVisible();
  await expect(page.locator('.error')).toContainText(/already exists/i);
});

// 3a. Login success with correct creds → /app/.
base('login with correct credentials lands on the dashboard', async ({ page }) => {
  const account = freshAccount('login');
  // Register, then log out so we can drive the login form from scratch.
  await registerAccount(page, account);
  await page.getByTestId('logout-link').click();
  await page.waitForURL('**/web/login**');

  await loginAs(page, account);
  await expect(page).toHaveURL(/\/app\//);
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
});

// 3b. Login with a wrong password → 401, error shown, stays on /web/login.
base('login with a wrong password shows an error and stays on the login page', async ({ page }) => {
  const account = freshAccount('badpw');
  await registerAccount(page, account);
  await page.getByTestId('logout-link').click();
  await page.waitForURL('**/web/login**');

  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill('wrong-password');

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/web/login') && res.request().method() === 'POST',
    ),
    page.locator('button[type="submit"]').click(),
  ]);

  expect(response.status()).toBe(401);
  await expect(page).toHaveURL(/\/web\/login/);
  await expect(page).not.toHaveURL(/\/app\//);
  await expect(page.locator('.error')).toBeVisible();
  await expect(page.locator('.error')).toContainText(/invalid/i);
});

// 4. Unauthenticated visit to /app/ → AuthGuard redirects to /web/login (with redirect param).
base('unauthenticated /app/ visit is redirected to /web/login', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/app/');
  await page.waitForURL('**/web/login**');

  await expect(page).toHaveURL(/\/web\/login/);
  // The SPA preserves where it tried to go via ?redirect=...
  expect(new URL(page.url()).searchParams.get('redirect')).toContain('/app');
  await expect(page.locator('input[name="email"]')).toBeVisible();
});

// 5. Logout clears the session → /app/ now redirects to login.
base('logout clears the session so /app/ bounces back to login', async ({ page }) => {
  const account = freshAccount('logout');
  await registerAccount(page, account);

  await page.getByTestId('logout-link').click();
  await page.waitForURL('**/web/login**');

  // Session is gone: revisiting the SPA bounces to login again.
  await page.goto('/app/');
  await page.waitForURL('**/web/login**');
  await expect(page).toHaveURL(/\/web\/login/);
});

// 6. Legacy paths 301-redirect into the SPA.
base('legacy /web/dashboard and /web/import 301-redirect into the SPA', async ({ request }) => {
  const dashboard = await request.get('/web/dashboard', { maxRedirects: 0 });
  expect(dashboard.status()).toBe(301);
  expect(dashboard.headers()['location']).toBe('/app/');

  const importPath = await request.get('/web/import', { maxRedirects: 0 });
  expect(importPath.status()).toBe(301);
  expect(importPath.headers()['location']).toBe('/app/import');
});

// 7. Bot honeypots: raw form POSTs (no page JS) are rejected unless the JS
//    token is present and the decoy field is empty. The real browser flow
//    (tested in #1) populates the token via JS, so genuine signups still work.
base('register honeypot rejects a bot that omits the JS token', async ({ request }) => {
  const account = freshAccount('bot-nojs');
  const res = await request.post('/auth/register?from=web', {
    form: { name: account.name, email: account.email, password: account.password, timezone: 'UTC' },
    maxRedirects: 0,
  });
  // Missing hp_js token → rejected, no redirect into the SPA.
  expect(res.status()).toBe(400);
  expect(res.headers()['location']).toBeUndefined();
});

base('register honeypot rejects a bot that fills the decoy field', async ({ request }) => {
  const account = freshAccount('bot-decoy');
  const res = await request.post('/auth/register?from=web', {
    form: {
      name: account.name,
      email: account.email,
      password: account.password,
      timezone: 'UTC',
      hp_js: 'mob-human',
      website: 'https://spam.example',
    },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(400);
  expect(res.headers()['location']).toBeUndefined();
});

base('register honeypot allows a submission with the JS token and empty decoy', async ({ request }) => {
  const account = freshAccount('honeypot-ok');
  const res = await request.post('/auth/register?from=web', {
    form: { name: account.name, email: account.email, password: account.password, timezone: 'UTC', hp_js: 'mob-human', website: '' },
    maxRedirects: 0,
  });
  // Valid signup → auto-login redirect into the SPA (not a 400).
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toBe('/app/');
});
