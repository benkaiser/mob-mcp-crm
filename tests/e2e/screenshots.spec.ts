import { test } from './fixtures';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Visual screenshot harness (bean mob-crm-rih5).
 *
 * Not an assertion spec — its job is to walk every meaningful screen and dump a
 * full-page PNG in BOTH light and dark mode into `.design-preview/shots/`. The
 * captures feed the per-screen visual-refinement pass (bean ed4k): they make
 * theme regressions (e.g. a form input that ignored --color-input-bg in dark
 * mode) obvious at a glance instead of waiting to be spotted by hand.
 *
 * Run just this file:
 *   npx playwright test tests/e2e/screenshots.spec.ts --project=selfhosted
 *
 * It seeds one richly-populated contact so detail/profile screens aren't empty,
 * then visits each route under both themes by toggling localStorage('mob-theme')
 * before load (matching the pre-paint boot script in index.html).
 */

const OUT_DIR = join(process.cwd(), '.design-preview', 'shots');

type Theme = 'light' | 'dark';

test.describe('visual screenshot harness', () => {
  // Serialize so the shared output dir and console stay readable.
  test.describe.configure({ mode: 'serial' });

  test('capture all screens in light and dark', async ({ page, seeder }) => {
    test.slow();
    mkdirSync(OUT_DIR, { recursive: true });

    // ─── Seed a rich contact so detail screens have content ──────────────
    const contact = await seeder.createContact({
      first_name: 'Ada',
      last_name: 'Lovelace',
      company: 'Analytical Engines',
      job_title: 'Mathematician',
      status: 'active',
      gender: 'Female',
      is_favorite: true,
    });
    const cid = contact.id;

    await seeder.post(`/contacts/${cid}/contact-methods`, {
      kind: 'email', label: 'work', value: 'ada@analyticalengines.test',
    }).catch(() => {});
    await seeder.post(`/contacts/${cid}/notes`, {
      body: 'First met at the Royal Society lecture. Loves discussing Bernoulli numbers.',
    }).catch(() => {});
    await seeder.post(`/contacts/${cid}/tags`, { name: 'VIP' }).catch(() => {});

    // A couple more contacts so the list view isn't a single row.
    await seeder.createContact({ first_name: 'Alan', last_name: 'Turing', status: 'active' }).catch(() => {});
    await seeder.createContact({ first_name: 'Grace', last_name: 'Hopper', status: 'active' }).catch(() => {});

    // ─── Routes to capture ────────────────────────────────────────────────
    const screens: { name: string; path: string }[] = [
      { name: 'dashboard', path: '/app/' },
      { name: 'contacts-list', path: '/app/contacts' },
      { name: 'contact-new', path: '/app/contacts/new' },
      { name: 'contact-profile', path: `/app/contacts/${cid}` },
      { name: 'contact-edit', path: `/app/contacts/${cid}/edit` },
      { name: 'contact-duplicates', path: '/app/contacts/duplicates' },
      { name: 'search', path: '/app/search?q=ada' },
      { name: 'import', path: '/app/import' },
      { name: 'data', path: '/app/data' },
      { name: 'settings', path: '/app/settings' },
    ];

    async function setTheme(theme: Theme) {
      // Mirror the pre-paint boot script: 'dark'|'light' is an explicit override,
      // persisted under 'mob-theme'. Set it before navigations take effect.
      await page.addInitScript((t) => {
        try { localStorage.setItem('mob-theme', t as string); } catch { /* ignore */ }
      }, theme);
    }

    for (const theme of ['light', 'dark'] as Theme[]) {
      await setTheme(theme);
      for (const screen of screens) {
        await page.goto(screen.path);
        // Let the route settle (spinner → content). Best-effort; don't fail the
        // harness on a slow individual screen.
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(300);
        await page.screenshot({
          path: join(OUT_DIR, `${screen.name}.${theme}.png`),
          fullPage: true,
        });
      }
    }
  });
});
