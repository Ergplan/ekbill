import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { DEMO_VERSION } from '../../packages/db/src/demo';

/**
 * The welcome and the app demo (20 Oct). A first-timer is greeted on Home after sign-in ("Ek chhota sa app tour
 * chalega?"); Haan asks the language; the demo walks the sample business with the ring and the caption, fills the
 * bill's first line as the voice would, and ends at "Apne baare mein batao". It stops anywhere and goes Home;
 * someone already billing starts it from Aap, in any language, without changing theirs; a "naya kya hai" card
 * offers it once; a visitor watches it from the welcome screen. The build has no recordings (AI_TRANSPORT=fake):
 * the captions carry it, and the caption's arrow moves it on.
 */
const DB = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev';

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}
/** Moves the demo on with the caption's arrow until the bar is gone (the end). */
async function skipToEnd(page: Page) {
  for (let i = 0; i < 12; i++) {
    if (!(await page.getByTestId('demo-bar').count())) return;
    await page
      .locator('.eb-guide__next')
      .click({ timeout: 10_000 })
      .catch(() => undefined);
    await page.waitForTimeout(400);
  }
}

test('a first-timer: greeted on Home, Haan, Hinglish, the walk on the sample business, ending at "Apne baare mein batao"', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const phone = `+9197${String(Date.now()).slice(-8)}`;
  await page.goto(`/dev/switch/${encodeURIComponent(phone)}?signin=1`);
  await hydrated(page);
  const dialog = page.getByTestId('demo-dialog');
  await expect(dialog).toContainText('Namaste! EkBill mein aapka swagat hai. Ek chhota sa app tour chalega?');
  await page.getByTestId('demo-yes').click();
  await expect(dialog).toContainText('Kis bhasha mein dekhna hai?');
  await expect(page.getByRole('radio', { name: 'Hinglish' })).toBeChecked();
  await page.getByTestId('demo-start').click();
  const bar = page.getByTestId('demo-bar');
  await expect(bar).toContainText('Demo · 1/9');
  await expect(bar).toContainText('Namoona data');
  await expect(page).toHaveURL(/as=owner/);
  await expect(page.locator('.eb-guide__caption')).toContainText('Yeh aapka Ghar hai');
  await expect(page.locator('.eb-guide__caption')).toContainText('Pakka bill');
  // Then the kaccha bill (20 Oct): which is which, beside the pakka one.
  await page.locator('.eb-guide__next').click();
  await expect(bar).toContainText('Demo · 2/9');
  await expect(page.locator('.eb-guide__caption')).toContainText('Kaccha bill, yaani estimate');
  // On to the bill: its first line fills itself while the line is said.
  await page.locator('.eb-guide__next').click();
  await page.locator('.eb-guide__next').click();
  await expect(bar).toContainText('Demo · 4/9');
  await expect(page).toHaveURL(/\/bills\/new\?customer=mehta&as=owner/);
  await expect(page.locator('#line-0-what')).toHaveValue('Ceiling fan', { timeout: 8_000 });
  await expect(page.locator('#line-0-rate')).toHaveValue('350', { timeout: 8_000 });
  await skipToEnd(page);
  // The end: the real Home (no look), "Apne baare mein batao" lit and said.
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator('.eb-guide__caption')).toContainText('Ab apne baare mein batao');
  await expect(page.locator('[data-guide="about"]')).toBeVisible();
  // Seen: not offered again.
  await page.reload();
  await hydrated(page);
  await page.waitForTimeout(1500);
  await expect(dialog).toHaveCount(0);
  const seen = await sql('select demo_seen_version from users where phone_e164 = $1', [phone]);
  expect(seen.rows[0].demo_seen_version).toBeGreaterThan(0);
});

test('Na: no demo, the star is "Apne baare mein batao", and the greeting is not offered again', async ({ page }) => {
  const phone = `+9196${String(Date.now()).slice(-8)}`;
  await page.goto(`/dev/switch/${encodeURIComponent(phone)}?signin=1`);
  await hydrated(page);
  await page.getByTestId('demo-no').click();
  await expect(page.getByTestId('demo-dialog')).toHaveCount(0);
  await expect(page.locator('.eb-star [data-primary="true"]')).toHaveText(/Apne baare mein batao/);
  await page.goto('/');
  await hydrated(page);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('demo-dialog')).toHaveCount(0);
});

test('someone billing starts it from Aap in Tamil, stops it midway, and is Home in their own language', async ({
  page,
}) => {
  await page.goto('/dev/switch/sharma?to=/aap');
  await hydrated(page);
  await page.getByText('App ka demo dekho').click();
  await page.getByTestId('demo-dialog').getByRole('radio', { name: 'தமிழ்' }).click();
  await page.getByTestId('demo-start').click();
  const bar = page.getByTestId('demo-bar');
  await expect(bar).toContainText('டெமோ · 1/9');
  await expect(page.locator('.eb-guide__caption')).toContainText('இது உங்கள் முகப்பு');
  await page.locator('.eb-guide__next').click();
  await page.getByTestId('demo-stop').click();
  await expect(bar).toHaveCount(0);
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi-Latn');
  await expect(page.locator('.eb-guide__ring')).toHaveCount(0);
});

test('"naya kya hai": offered once to someone billing who has not seen it; Baad mein keeps it away', async ({
  page,
}) => {
  await sql("update users set demo_seen_version = 0 where phone_e164 = '+919822012345'");
  try {
    await page.goto('/dev/switch/sharma?to=/');
    await hydrated(page);
    await expect(page.getByTestId('demo-dialog')).toHaveCount(0);
    const card = page.locator('[data-guide="demo"]');
    await expect(card).toContainText('Kaccha bill (estimate), number se seedha WhatsApp');
    await page.getByRole('button', { name: 'Baad mein' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await hydrated(page);
    await expect(page.locator('[data-guide="demo"]')).toHaveCount(0);
  } finally {
    await sql("update users set demo_seen_version = $1 where phone_e164 = '+919822012345'", [DEMO_VERSION]);
  }
});

test('a visitor watches it from the welcome screen and is brought back to start', async ({ page }) => {
  test.setTimeout(90_000);
  await page.context().clearCookies();
  await page.goto('/welcome');
  await hydrated(page);
  await page.getByRole('button', { name: 'Pehle demo dekho (45 sec)' }).click();
  await page.getByTestId('demo-start').click();
  await expect(page.getByTestId('demo-bar')).toContainText('Demo · 1/9');
  await skipToEnd(page);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.locator('.eb-guide__caption')).toContainText('Shuru karne ke liye');
});
