import { expect, test, type Page } from '@playwright/test';

import { goldenPaths } from '../../apps/web/screens/golden-paths';

/**
 * The golden paths (I9), walked on the prototype and counted: every click
 * and every field fill below is one tap, and the number must equal the
 * sequence in apps/web/screens/golden-paths.ts, which must be within budget.
 */
const budget = (id: string) => goldenPaths.find((p) => p.id === id)!;

async function tap(page: Page, counter: { n: number }, action: () => Promise<void>) {
  await hydrated(page);
  counter.n += 1;
  await action();
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'eb-theme', value: 'narangi', url: 'http://127.0.0.1:3000' }]);
});

/** A tap lands only on a hydrated page; the dev server compiles a screen on its first visit. */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}

test('(a) repeat bill to a regular customer, sent on WhatsApp: 4 taps', async ({ page }) => {
  const c = { n: 0 };
  await page.goto('/');
  await hydrated(page);
  await tap(page, c, () => page.getByRole('link', { name: 'Mehta Traders' }).click());
  await expect(page).toHaveURL(/\/bills\/new\?customer=mehta/);
  await tap(page, c, () => page.getByRole('button', { name: 'Haan, wahi bharo' }).click());
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done/);
  await expect(page.locator('.eb-paper')).toContainText('Mehta Traders');
  await tap(page, c, () => page.getByRole('button', { name: 'WhatsApp pe bhejo' }).click());
  await expect(page.getByRole('button', { name: /WhatsApp pe gaya/ })).toBeVisible();
  expect(c.n).toBe(budget('a').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('a').budget);
});

test('(b) money came in, in full: 3 taps', async ({ page }) => {
  const c = { n: 0 };
  await page.goto('/');
  await hydrated(page);
  await tap(page, c, () => page.locator('.eb-owedrow').first().getByRole('link').click());
  await expect(page).toHaveURL(/\/bills\/INV-/);
  await tap(page, c, () => page.getByRole('button', { name: 'Paise aa gaye' }).click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await tap(page, c, () => page.getByRole('radio', { name: /Poore/ }).click());
  await expect(page.locator('main')).toContainText('Likh liya');
  expect(c.n).toBe(budget('b').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('b').budget);
});

test('(c) bill from a photo: 3 taps plus the picker', async ({ page }) => {
  const c = { n: 0 };
  await page.goto('/');
  await hydrated(page);
  await tap(page, c, () => page.getByRole('link', { name: 'Photo se bill' }).click());
  await expect(page).toHaveURL(/\/bills\/photo/);
  await tap(page, c, () => page.getByRole('radio', { name: 'Photo lo' }).click());
  await expect(page).toHaveURL(/state=review/, { timeout: 10_000 });
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done/);
  await expect(page.locator('.eb-paper')).toContainText('Fan repair');
  expect(c.n).toBe(budget('c').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('c').budget);
});

test('(d) brand-new owner from welcome to the first bill on WhatsApp: 14 taps', async ({ page }) => {
  const c = { n: 0 };
  await page.goto('/dev/switch/new');
  await expect(page).toHaveURL(/\/welcome/);
  await hydrated(page);
  await tap(page, c, () => page.getByRole('button', { name: 'Shuru karein' }).click());
  await tap(page, c, () => page.getByLabel('Phone number').fill('9822000005'));
  await tap(page, c, () => page.getByRole('button', { name: 'Aage' }).click());
  await expect(page).toHaveURL(/state=code/);
  await tap(page, c, () => page.getByLabel('6-digit code').fill('123456'));
  await expect(page).toHaveURL(/\/setup\/name/);
  await tap(page, c, () => page.getByLabel(/dukaan ka naam/).fill('Naya Electricals'));
  await tap(page, c, () => page.getByRole('button', { name: 'Aage' }).click());
  await expect(page).toHaveURL(/\/setup\/gst/);
  await tap(page, c, () => page.getByRole('radio', { name: 'Nahi', exact: true }).click());
  await expect(page).toHaveURL(/\/setup\/review/);
  await tap(page, c, () => page.getByRole('button', { name: 'Chalo, shuru karte hain' }).click());
  await expect(page).toHaveURL(/\/$/);
  await tap(page, c, () => page.getByRole('button', { name: 'Pehla bill banao' }).click());
  await expect(page).toHaveURL(/\/bills\/new\?first=1/);
  await tap(page, c, () => page.getByLabel('Customer ka naam').fill('Pehla Customer'));
  await tap(page, c, () => page.getByLabel('Kya kiya?').fill('Fan install'));
  await tap(page, c, () => page.getByLabel('Rate (₹)').fill('1350'));
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done/);
  await expect(page.locator('.eb-paper')).toContainText('Pehla Customer');
  await tap(page, c, () => page.getByRole('button', { name: 'WhatsApp pe bhejo' }).click());
  expect(c.n).toBe(budget('d').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('d').budget);
});
