import { expect, test, type Page } from '@playwright/test';

import { seedBuild } from '../../packages/db/src/seed';

/**
 * Stage 2: the switcher issues real sessions. Switch to the owner of A and
 * see A; to the staff of B and see B; the theme a person picks is theirs
 * alone and survives a switch away and back.
 */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}

test('switch to the owner of Sharma Electricals and see Sharma; to the staff of Gupta Kirana and see Gupta', async ({
  page,
}) => {
  await page.goto('/dev/switch/sharma');
  await expect(page).toHaveURL(/\/$/);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Sharma Electricals');
  await expect(page.locator('main')).toContainText('Sharma ji');
  await page.goto('/dev/switch/sunita');
  await expect(page).toHaveURL(/\/$/);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Gupta Kirana');
  await expect(page.locator('main')).toContainText('Sunita');
  await expect(page.locator('main')).not.toContainText('Sharma Electricals');
});

test('the brand-new owner lands on welcome; an unknown person goes back to the list', async ({ page }) => {
  // Another journey in this run may have set the brand-new owner up; the seed makes them new again.
  await seedBuild(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev', {
    log: () => undefined,
    // The people only: the bills were issued by global-setup, in a Node with the server's import conditions.
    bills: false,
  });
  await page.goto('/dev/switch/new');
  await expect(page).toHaveURL(/\/welcome/);
  await page.goto('/dev/switch/nobody');
  await expect(page).toHaveURL(/\/dev\/switch$/);
});

test('the theme persists per user: Sharma ji picks Harmony, Ravi stays Narangi, Sharma ji is still Harmony', async ({
  page,
}) => {
  await page.goto('/dev/switch/sharma?to=/aap');
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'narangi');
  await page.getByRole('radio', { name: 'Harmony' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'harmony');
  await page.waitForTimeout(500); // the action's round trip
  await page.reload();
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'harmony');
  await page.goto('/dev/switch/ravi?to=/aap');
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'narangi');
  await page.goto('/dev/switch/sharma?to=/aap');
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'harmony');
  // Leave Sharma ji as the seed has him, for the next run and the baselines.
  await page.getByRole('radio', { name: 'Narangi' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'narangi');
  await page.waitForTimeout(500);
  await page.reload();
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'narangi');
});

test('the language is saved for the person: Ravi picks English, it is there after a reload, then Hinglish again', async ({
  page,
}) => {
  await page.goto('/dev/switch/ravi?to=/aap');
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-Latn');
  await page.getByRole('radio', { name: 'English' }).click();
  await page.waitForTimeout(500); // the action's round trip
  await page.reload();
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN');
  await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
  // Leave Ravi as the seed has him.
  await page.getByRole('radio', { name: 'Hinglish' }).click();
  await page.waitForTimeout(500);
  await page.reload();
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-Latn');
});

test('with sign-in off, a new phone at login is a new owner: the code fills itself in, then setup', async ({
  page,
}) => {
  const phone = `98${String(Date.now()).slice(-8)}`;
  await page.context().clearCookies();
  await page.goto('/welcome');
  await hydrated(page);
  await page.getByRole('button', { name: 'Shuru karein' }).click();
  await page.getByLabel('Phone number').fill(phone);
  await page.getByRole('button', { name: 'Aage' }).click();
  await expect(page).toHaveURL(/state=code/);
  // No tap: the code arrives by itself, as the screen promises, and moves on.
  await expect(page).toHaveURL(/\/setup\/name/, { timeout: 15_000 });
  await hydrated(page);
  await expect(page.getByLabel(/dukaan ka naam/)).toBeVisible();
});

test('in the build the OTP door is closed (404) and the switcher is the door', async ({ request }) => {
  const res = await request.post('/api/auth/otp', { data: { idToken: 'x'.repeat(40) } });
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'otp.off' });
  expect((await request.get('/dev/switch')).status()).toBe(200);
});
