import { test as base, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';

/**
 * Mob CRM E2E fixtures.
 *
 * ─── Testid naming convention ──────────────────────────────────────────���───
 * Shared components expose stable `data-testid` hooks (added in the harness
 * bean). Feature specs add their own page-scoped testids. Convention:
 *
 *   - Navigation:      nav-<label-lowercased>      e.g. nav-contacts, nav-settings
 *   - Shell search:    shell-search-input
 *   - Logout:          logout-link
 *   - Sidebar user:    sidebar-user, sidebar-user-name, sidebar-user-plan
 *   - Modal:           modal, modal-backdrop, modal-title, modal-close,
 *                      modal-body, modal-footer
 *   - ConfirmDialog:   confirm-accept, confirm-cancel (plus the modal-* hooks)
 *   - Toast:           toast-stack, toast (each toast carries data-tone)
 *   - ErrorBanner:     error-banner, error-banner-dismiss
 *   - EmptyState:      empty-state
 *   - Spinner:         spinner, spinner-center
 *   - Tabs:            tabs, tab-<id>
 *   - Badge:           badge (carries data-tone)
 *
 * Page-scoped testids should be prefixed with the page/feature, e.g.
 * `contact-form-first-name`, `contacts-row`, `import-source-vcard`.
 * Buttons forward arbitrary props, so add `data-testid` inline at the call site.
 * ────��──────────────────────────────────────────────────────────────────────
 */

export interface TestAccount {
  name: string;
  email: string;
  password: string;
}

let accountCounter = 0;

/** Generate a unique, valid account for this worker + invocation. */
export function freshAccount(prefix = 'user'): TestAccount {
  accountCounter += 1;
  const unique = `${Date.now().toString(36)}-${process.pid}-${accountCounter}`;
  return {
    name: `Test ${prefix} ${accountCounter}`,
    email: `${prefix}-${unique}@example.test`,
    password: 'password123',
  };
}

/**
 * Register a brand-new account by driving the real server-rendered registration
 * form. On success the server auto-logs-in (sets mob_session) and redirects to
 * the SPA at /app/. Returns once the SPA dashboard nav is visible.
 */
export async function registerAccount(page: Page, account = freshAccount()): Promise<TestAccount> {
  await page.goto('/auth/register?from=web');
  await page.locator('#name').fill(account.name);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('button[type="submit"]').click();
  // Lands on the SPA; wait for the shell nav to render.
  await page.waitForURL('**/app/**');
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
  return account;
}

/** Log in an existing account via the /web/login form. */
export async function loginAs(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/web/login');
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/app/**');
  await expect(page.getByTestId('nav-dashboard')).toBeVisible();
}

/**
 * A thin wrapper over the internal JSON API (/web/api/*) using the browser
 * context's cookies (session + CSRF). Use this to seed data quickly without
 * clicking through the UI.
 *
 * The CSRF token is the `mob_csrf` cookie echoed in the X-CSRF-Token header,
 * matching the SPA client. A GET is performed first (if needed) to ensure the
 * cookie exists.
 */
export class ApiSeeder {
  constructor(private request: APIRequestContext, private context: BrowserContext, private baseURL: string) {}

  private async csrfToken(): Promise<string> {
    const cookies = await this.context.cookies();
    let csrf = cookies.find((c) => c.name === 'mob_csrf')?.value;
    if (!csrf) {
      // A GET sets the cookie; hit /me then re-read.
      await this.request.get(`${this.baseURL}/web/api/me`);
      const after = await this.context.cookies();
      csrf = after.find((c) => c.name === 'mob_csrf')?.value;
    }
    if (!csrf) throw new Error('Could not obtain mob_csrf cookie for API seeding');
    return csrf;
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await this.request.get(`${this.baseURL}/web/api${path}`);
    if (!res.ok()) throw new Error(`GET ${path} failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return body.data as T;
  }

  async post<T = unknown>(path: string, data: unknown): Promise<T> {
    const token = await this.csrfToken();
    const res = await this.request.post(`${this.baseURL}/web/api${path}`, {
      data,
      headers: { 'X-CSRF-Token': token, 'Content-Type': 'application/json' },
    });
    if (!res.ok()) throw new Error(`POST ${path} failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return body.data as T;
  }

  async patch<T = unknown>(path: string, data: unknown): Promise<T> {
    const token = await this.csrfToken();
    const res = await this.request.patch(`${this.baseURL}/web/api${path}`, {
      data,
      headers: { 'X-CSRF-Token': token, 'Content-Type': 'application/json' },
    });
    if (!res.ok()) throw new Error(`PATCH ${path} failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return body.data as T;
  }

  async del(path: string): Promise<void> {
    const token = await this.csrfToken();
    const res = await this.request.delete(`${this.baseURL}/web/api${path}`, {
      headers: { 'X-CSRF-Token': token },
    });
    if (!res.ok()) throw new Error(`DELETE ${path} failed: ${res.status()} ${await res.text()}`);
  }

  /** Convenience: create a contact, returning its id. */
  async createContact(fields: Record<string, unknown>): Promise<{ id: string }> {
    return this.post<{ id: string }>('/contacts', fields);
  }
}

/**
 * Extended `test` with auto-registered, authenticated fixtures.
 *
 *   - `account`  - a freshly registered account. This is an AUTO fixture: every
 *     test that imports this `test` starts already logged in (session + csrf
 *     cookies set, SPA renders the authenticated shell). Request it by name to
 *     read the account's name/email/password.
 *   - `seeder`   - an ApiSeeder bound to the authenticated context for fast setup
 *
 * Specs that need a clean UNAUTHENTICATED page (register/login/logout flows)
 * must import the base test from '@playwright/test' instead, so they don't pick
 * up the auto-registration.
 */
export const test = base.extend<{
  account: TestAccount;
  seeder: ApiSeeder;
}>({
  account: [async ({ page }, use) => {
    const account = await registerAccount(page);
    await use(account);
  }, { auto: true }],
  seeder: async ({ context, baseURL, account }, use) => {
    // `account` (auto) guarantees the context is authenticated before seeding.
    void account;
    const seeder = new ApiSeeder(context.request, context, baseURL ?? 'http://localhost:3100');
    await use(seeder);
  },
});

export { expect };
