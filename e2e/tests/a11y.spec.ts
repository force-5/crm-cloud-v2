import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility gate (plan §9): every screen, in light and dark themes, has no serious or critical
 * WCAG 2.1 AA violations. Runs against the production build like smoke.spec.ts.
 */

const ADMIN = { email: 'admin@force5.com', password: 'Force5!demo' }; // mock-vms seed user

async function signIn(page: Page) {
  await page.goto('login');
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/^password/i).fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function audit(page: Page, screen: string) {
  // Let loading skeletons settle so axe sees the real content.
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = blocking.map(
    (v) => `${screen}: [${v.impact}] ${v.id} — ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`,
  );
  expect(report, report.join('\n')).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('public pages', async ({ page }) => {
      await page.goto('login');
      await audit(page, 'login');
      await page.goto('forgot-password');
      await audit(page, 'forgot-password');
    });

    test('signed-in screens', async ({ page }) => {
      await signIn(page);
      await audit(page, 'dashboard');

      await page.goto('accounts');
      await audit(page, 'accounts');

      await page.getByRole('link', { name: 'Northstar Construction' }).first().click();
      await expect(page.getByRole('heading', { name: 'Northstar Construction' })).toBeVisible();
      await audit(page, 'account details');
      await page.getByRole('tab', { name: /licenses/i }).click();
      await audit(page, 'account licenses');

      await page.goto('accounts/new');
      await audit(page, 'new account');

      await page.goto('products');
      await audit(page, 'products');
      await page.goto('products/new');
      await audit(page, 'new product');

      await page.goto('profile');
      await audit(page, 'profile');
      for (const tab of [/security/i, /appearance/i]) {
        await page.getByRole('tab', { name: tab }).click();
        await audit(page, `profile ${tab.source}`);
      }

      await page.goto('no-such-page');
      await audit(page, '404');
    });
  });
}
