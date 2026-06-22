import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

/**
 * Playwright E2E configuration for the Mob CRM Preact SPA.
 *
 * Two real servers are booted via `webServer` (the SPA must be built first with
 * `npm run build:web`, which the build:web command below handles):
 *
 *   - self-hosted (port 3100): default mode, unlimited plan. Used by the bulk of
 *     the feature specs (auth, contacts, sub-entities, timeline, search,
 *     duplicates, import, export, settings, navigation).
 *   - hosted     (port 3101): MOB_HOSTED=true, beta free plan active with
 *     all features enabled and no contact cap. Used by the hosted beta specs.
 *
 * Each server gets its own throwaway MOB_DATA_DIR so test runs never touch real
 * data and start from a clean database every run.
 *
 * Projects:
 *   - `selfhosted` → baseURL http://localhost:3100, runs everything EXCEPT
 *     hosted/*.spec.ts
 *   - `hosted`     → baseURL http://localhost:3101, runs ONLY hosted/*.spec.ts
 *
 * Note: vitest owns `tests/**​/*.test.ts`; Playwright owns `tests/e2e/**​/*.spec.ts`
 * so the two runners never pick up each other's files.
 */

const SELF_HOSTED_PORT = Number(process.env.E2E_PORT ?? 3100);
const HOSTED_PORT = Number(process.env.E2E_HOSTED_PORT ?? 3101);

const selfHostedDataDir = mkdtempSync(join(tmpdir(), 'mob-e2e-self-'));
const hostedDataDir = mkdtempSync(join(tmpdir(), 'mob-e2e-hosted-'));

// tsx runs the TS server entry directly so we don't need a server bundle for E2E.
// The SPA bundle is built once in global-setup.ts before either server boots.
function serverCommand(port: number, dataDir: string, hosted: boolean): string {
  const env = [
    `PORT=${port}`,
    `MOB_DATA_DIR=${dataDir}`,
    `MOB_BASE_URL=http://localhost:${port}`,
    hosted ? 'MOB_HOSTED=true' : 'MOB_HOSTED=false',
  ].join(' ');
  return `${env} npx tsx src/index.ts`;
}

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'selfhosted',
      testIgnore: '**/hosted/**',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${SELF_HOSTED_PORT}`,
      },
    },
    {
      name: 'hosted',
      testMatch: '**/hosted/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${HOSTED_PORT}`,
      },
    },
  ],

  webServer: [
    {
      command: serverCommand(SELF_HOSTED_PORT, selfHostedDataDir, false),
      url: `http://localhost:${SELF_HOSTED_PORT}/web/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: serverCommand(HOSTED_PORT, hostedDataDir, true),
      url: `http://localhost:${HOSTED_PORT}/web/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
