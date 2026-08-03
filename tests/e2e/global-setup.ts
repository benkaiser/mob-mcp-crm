import { execSync } from 'node:child_process';

/**
 * Playwright global setup - build the Preact SPA once before any webServer boots.
 *
 * Both E2E servers (self-hosted + hosted) serve the same built bundle from
 * dist-web/. Building here (rather than in each webServer command) avoids a race
 * where the hosted server boots before the self-hosted server has finished
 * emitting dist-web/.
 *
 * Set E2E_SKIP_BUILD=1 to skip the rebuild - useful when several `playwright
 * test` invocations run concurrently against an already-built bundle + already
 * booted servers (reuseExistingServer), to avoid concurrent builds racing on
 * dist-web/.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_BUILD === '1') {
    console.log('[e2e] E2E_SKIP_BUILD=1 - skipping SPA build.');
    return;
  }
  console.log('[e2e] Building SPA (npm run build:web)…');
  execSync('npm run build:web', { stdio: 'inherit' });
}
