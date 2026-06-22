import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

/**
 * Hosted-mode plan gating (bean mob-crm-9lsx).
 *
 * Runs under the `hosted` Playwright project (MOB_HOSTED=true, port 3101) where
 * free-tier gating is active: 11-contact cap, public API tokens + webhooks
 * blocked. Each test registers a fresh FREE account via the `account` fixture.
 *
 * Free-plan gating asserted three ways:
 *   - contact cap: the free tier caps total contacts at 11. Every fresh account
 *     already has 1 auto-created self-contact (is_me), so only 10 more can be
 *     added; seed 10 to reach the cap, then the next create is blocked (402).
 *   - tokens:   Settings shows the gated "upgrade" notice; POST /tokens → 403.
 *   - webhooks: Settings shows the gated "upgrade" notice; POST /webhooks → 403.
 *
 * Paid-plan coverage is SKIPPED: there is no API/route seam to upgrade an
 * account's plan (plan is a `users.plan` DB column set elsewhere; the web-api
 * exposes no setPlan/upgrade endpoint — see src/server/web-api/index.ts and
 * src/services/plans.ts). See the agent report for the seam the lead would need.
 */

/** POST to /web/api<path> with the session + CSRF cookies, returning the raw status. */
async function apiPostStatus(page: Page, path: string, data: unknown): Promise<number> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'mob_csrf')?.value ?? '';
  const res = await page.request.post(`/web/api${path}`, {
    data,
    headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
  });
  return res.status();
}

function seedContacts(seeder: { createContact: (f: Record<string, unknown>) => Promise<{ id: string }> }, n: number) {
  const work: Promise<{ id: string }>[] = [];
  for (let i = 0; i < n; i++) {
    work.push(seeder.createContact({ first_name: `Seed${i}`, last_name: 'Contact' }));
  }
  return Promise.all(work);
}

test.describe('hosted free plan — contact cap (11)', () => {
  test('blocks the over-cap contact via the API with a quota error', async ({ seeder }) => {
    // 1 self-contact + 10 seeded = 11 (the cap). Seed 10 to fill it.
    await seedContacts(seeder, 10);

    // The free-tier cap is 11 total, so the next create must be rejected.
    // ApiSeeder throws `POST /contacts failed: <status> <text>` on a non-2xx.
    const rejection = await seeder
      .createContact({ first_name: 'OverCap', last_name: 'Contact' })
      .then(() => null)
      .catch((err: unknown) => (err instanceof Error ? err.message : String(err)));

    expect(rejection, 'the over-cap contact should have been rejected').not.toBeNull();
    expect(rejection).toContain('402');
    expect(rejection!.toLowerCase()).toContain('contact limit reached');

    // Usage now reflects 11 contacts at the cap of 11.
    const me = await seeder.get<{ usage: { contacts: number; contact_cap: number } }>('/me');
    expect(me.usage.contacts).toBe(11);
    expect(me.usage.contact_cap).toBe(11);
  });

  test('blocks the over-cap contact via the SPA contact form with a cap message', async ({ page, seeder }) => {
    // 1 self-contact + 10 seeded = 11 (the cap).
    await seedContacts(seeder, 10);

    await page.goto('/app/contacts/new');
    await page.locator('#first_name').fill('Twelfth');
    await page.getByRole('button', { name: 'Create contact' }).click();

    // The form surfaces the quota error in the shared ErrorBanner; no navigation.
    const banner = page.getByTestId('error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/contact limit reached/i);
    await expect(page).toHaveURL(/\/app\/contacts\/new/);
  });
});

test.describe('hosted free plan — API tokens gated', () => {
  test('Settings shows the upgrade notice and POST /tokens returns 403', async ({ page }) => {
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('heading', { name: 'API tokens' })).toBeVisible();

    // The TokensSection renders UpgradeNotice for feature "The public API".
    await expect(page.getByText(/The public API is not available on your current plan/i)).toBeVisible();

    const status = await apiPostStatus(page, '/tokens', { name: 'should-be-blocked' });
    expect(status).toBe(403);
  });
});

test.describe('hosted free plan — webhooks gated', () => {
  test('Settings shows the upgrade notice and POST /webhooks returns 403', async ({ page }) => {
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();

    // The WebhooksSection renders UpgradeNotice for feature "Webhooks".
    await expect(page.getByText(/Webhooks are not available on your current plan/i)).toBeVisible();

    const status = await apiPostStatus(page, '/webhooks', {
      url: 'https://example.com/hook',
      events: '*',
    });
    expect(status).toBe(403);
  });
});

test.describe('hosted paid plan — tokens + webhooks allowed, no cap', () => {
  // No web-api seam exists to upgrade a free account to paid (plan is the
  // `users.plan` DB column; PlanService has no setPlan/upgrade and no route
  // mounts one — see src/server/web-api/index.ts). Skipped until a seam exists.
  test.skip('tokens + webhooks allowed and contact cap lifted on a paid account', () => {
    // Intentionally empty — see describe block comment + agent report.
  });
});
