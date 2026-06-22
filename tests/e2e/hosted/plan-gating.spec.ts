import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';

/**
 * Hosted beta access.
 *
 * During beta, hosted free accounts keep the "free" plan label but have all
 * features enabled and no contact cap.
 */

async function apiPostStatus(page: Page, path: string, data: unknown): Promise<number> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'mob_csrf')?.value ?? '';
  const res = await page.request.post(`/web/api${path}`, {
    data,
    headers: { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' },
  });
  return res.status();
}

test('hosted free beta allows more than 11 contacts', async ({ seeder }) => {
  for (let i = 0; i < 15; i++) {
    await seeder.createContact({ first_name: `Seed${i}`, last_name: 'Contact' });
  }

  const me = await seeder.get<{ plan: string; usage: { contacts: number; contact_cap: number | null } }>('/me');
  expect(me.plan).toBe('free');
  expect(me.usage.contacts).toBeGreaterThan(11);
  expect(me.usage.contact_cap).toBeNull();
});

test('hosted free beta allows API tokens and webhooks', async ({ page }) => {
  await page.getByTestId('nav-settings').click();
  await expect(page.getByRole('heading', { name: 'API tokens' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();

  expect(await apiPostStatus(page, '/tokens', { name: 'beta-token' })).toBe(201);
  expect(await apiPostStatus(page, '/webhooks', {
    url: 'https://example.com/hook',
    events: '*',
  })).toBe(201);
});
