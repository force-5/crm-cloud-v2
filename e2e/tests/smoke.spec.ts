import { expect, test, type Page } from '@playwright/test';

// Seed user from apps/mock-vms (local mock only).
const ADMIN = { email: 'admin@force5.com', password: 'Force5!demo' };

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

async function signIn(page: Page) {
  await page.goto('login');
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/^password/i).fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('production bundle renders the login page', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the bare app URL loads the app (regression: /crm/ was a 403)', async ({ page }) => {
  const errors = trackErrors(page);
  const res = await page.goto('./'); // baseURL is …/crm/, so this is exactly /crm/
  expect(res?.status()).toBe(200);
  // Signed out: the session probe answers 401 (the browser logs it) and the app routes to sign-in.
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(errors.filter((e) => !e.includes('status of 401'))).toEqual([]);
});

test('sign in, browse accounts and open an account', async ({ page }) => {
  const errors = trackErrors(page);
  await signIn(page);
  await page.goto('accounts');
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await page.getByRole('link', { name: 'Northstar Construction' }).first().click();
  await expect(page.getByRole('heading', { name: 'Northstar Construction' })).toBeVisible();
  await page.getByRole('tab', { name: /licenses/i }).click();
  await expect(page.getByText('Gatekeeper Admin').first()).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow, 'no horizontal page scroll').toBe(false);
  expect(errors).toEqual([]);
});

test('unauthenticated deep link returns to the page after sign-in', async ({ page }) => {
  await page.goto('products');
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel(/email/i).fill(ADMIN.email);
  await page.getByLabel(/^password/i).fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
});
