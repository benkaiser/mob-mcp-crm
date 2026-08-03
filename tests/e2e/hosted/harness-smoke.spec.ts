import { test, expect } from '../fixtures';

/**
 * Hosted-mode harness smoke - proves the hosted webServer (MOB_HOSTED=true,
 * port 3101) boots and that a fresh hosted account is on the free plan.
 *
 * Full plan-gating coverage (contact cap, token/webhook 403s) lives in the
 * hosted plan-gating feature spec (bean mob-crm-9lsx). This file only validates
 * that the hosted project + baseURL wiring works.
 */

test('hosted account is on the free plan', async ({ page, seeder }) => {
  await expect(page.getByTestId('sidebar-user-plan')).toContainText('free');
  const me = await seeder.get<{ plan: string; hosted: boolean }>('/me');
  expect(me.hosted).toBe(true);
  expect(me.plan).toBe('free');
});
