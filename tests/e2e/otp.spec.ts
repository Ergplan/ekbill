import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Phone OTP end to end (Stage 10; Twilio Verify from 19 Oct), with the tests' code sender: the app runs with
 * AUTH_MODE=otp and OTP_FAKE_DIR, which sends no SMS and writes each code to <dir>/<digits>.txt (CI's otp job). The
 * owner signs in with no password; the switcher is closed; a wrong code says so; after 30 seconds a new code can be
 * asked for. Tagged @otp: the ordinary runs leave it out.
 */
const DIR = process.env.OTP_FAKE_DIR ?? '/tmp/ekbill-otp';
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
const fileOf = (phone: string) => join(DIR, `${phone.replace(/\D/g, '')}.txt`);
/** Forget any earlier code for the number, so the next one read is the one just sent. */
const forget = (phone: string) => rmSync(fileOf(phone), { force: true });
async function codeFor(phone: string): Promise<string> {
  for (let i = 0; i < 40; i += 1) {
    if (existsSync(fileOf(phone))) return readFileSync(fileOf(phone), 'utf8');
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code for ${phone}`);
}

test('@otp a new number signs in with the SMS code and lands on welcome; the switcher is closed', async ({ page }) => {
  const digits = `98${String(Date.now()).slice(-8)}`;
  forget(`+91${digits}`);
  await page.goto('/login');
  await hydrated(page);
  await page.locator('#phone').fill(digits);
  await page.locator('[data-guide="next"]').click();
  await expect(page.getByText('Code daalo')).toBeVisible({ timeout: 20_000 });
  const code = await codeFor(`+91${digits}`);
  await page.locator('[data-guide="code"] input').first().fill(code);
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 20_000 });
  expect((await page.request.get('/dev/switch')).status()).toBe(404);
  expect((await page.request.get('/dev/switch/sharma')).status()).toBe(404);
});

// Both themes (Stage 10 review: the OTP screens were seen in one): the code screen and its refusal in each.
for (const theme of ['narangi', 'harmony'] as const) {
  test(`@otp a wrong code says so and signs nobody in (${theme})`, async ({ page }) => {
    const digits = `9${theme === 'narangi' ? 7 : 6}${String(Date.now()).slice(-8)}`;
    forget(`+91${digits}`);
    await page.context().addCookies([{ name: 'eb-theme', value: theme, url: BASE }]);
    await page.goto('/login');
    await hydrated(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('#phone').fill(digits);
    await page.locator('[data-guide="next"]').click();
    await expect(page.getByText('Code daalo')).toBeVisible({ timeout: 20_000 });
    const sent = await codeFor(`+91${digits}`);
    await page
      .locator('[data-guide="code"] input')
      .first()
      .fill(sent === '000000' ? '111111' : '000000');
    await expect(page.locator('main [role="alert"]')).toContainText('Code galat hai');
    await expect(page).toHaveURL(/\/login/);
  });
}

test('@otp an owner already in EkBill signs in with their number and lands in their business', async ({ page }) => {
  const digits = '9822012345'; // Sharma ji, the build seed's owner
  forget(`+91${digits}`);
  await page.goto('/login');
  await hydrated(page);
  await page.locator('#phone').fill(digits);
  await page.locator('[data-guide="next"]').click();
  await expect(page.getByText('Code daalo')).toBeVisible({ timeout: 20_000 });
  await page
    .locator('[data-guide="code"] input')
    .first()
    .fill(await codeFor(`+91${digits}`));
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 20_000 });
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Sharma');
});

test('@otp after 30 seconds a new code can be asked for, and the new one signs in', async ({ page }) => {
  const digits = `93${String(Date.now()).slice(-8)}`;
  const phone = `+91${digits}`;
  forget(phone);
  await page.clock.install();
  await page.goto('/login');
  await hydrated(page);
  await page.locator('#phone').fill(digits);
  await page.locator('[data-guide="next"]').click();
  await expect(page.getByText('Code daalo')).toBeVisible({ timeout: 20_000 });
  await codeFor(phone);
  await expect(page.locator('main')).toContainText('Dobara bhejo · 0:30');
  await expect(page.locator('[data-guide="resend"]')).toHaveCount(0);
  forget(phone);
  await page.clock.fastForward(31_000);
  await page.locator('[data-guide="resend"]').click();
  const second = await codeFor(phone);
  await page.locator('[data-guide="code"] input').first().fill(second);
  await expect(page).toHaveURL(/\/welcome$/, { timeout: 20_000 });
});
