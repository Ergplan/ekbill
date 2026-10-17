import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 10, phone OTP against the Firebase Auth emulator (CI's otp job; OTP=1 and an app started
 * with AUTH_MODE=otp, FIREBASE_AUTH_EMULATOR_HOST, FIREBASE_PROJECT_ID). The SMS code is read
 * from the emulator; the owner signs in with no password; the switcher is closed; a wrong code
 * says so. Tagged @otp: the ordinary runs leave it out.
 */
const EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'demo-ekbill';
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function codeFor(phone: string): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const res = await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/verificationCodes`);
    const body = (await res.json()) as { verificationCodes?: Array<{ phoneNumber: string; code: string }> };
    const mine = (body.verificationCodes ?? []).filter((c) => c.phoneNumber === phone).at(-1);
    if (mine) return mine.code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no code for ${phone}`);
}

test('@otp a new number signs in with the SMS code and lands on welcome; the switcher is closed', async ({ page }) => {
  const digits = `98${String(Date.now()).slice(-8)}`;
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
    await page.context().addCookies([{ name: 'eb-theme', value: theme, url: BASE }]);
    await page.goto('/login');
    await hydrated(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.locator('#phone').fill(digits);
    await page.locator('[data-guide="next"]').click();
    await expect(page.getByText('Code daalo')).toBeVisible({ timeout: 20_000 });
    await codeFor(`+91${digits}`);
    await page.locator('[data-guide="code"] input').first().fill('000000');
    await expect(page.locator('main [role="alert"]')).toContainText('Code galat hai');
    await expect(page).toHaveURL(/\/login/);
  });
}

test('@otp an owner already in EkBill signs in with their number and lands in their business', async ({ page }) => {
  const digits = '9822012345'; // Sharma ji, the build seed's owner
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
