import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Aapka plan (20 Oct): 20 bills free, then ₹20 a month by UPI; the referral link. The app runs with payments taken
 * (EKBILL_UPI_ID, playwright.config.ts). Verma Traders pays like anyone (the seed's busy businesses do not); a
 * friend who comes by Sharma ji's link and sets up shows as joined on Sharma ji's plan.
 */
const DB = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev';

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}

test('Verma pays ₹20 by UPI and gives the reference; the month starts; the reference cannot be used twice', async ({
  page,
}) => {
  await page.goto('/dev/switch/verma?to=/aap');
  await hydrated(page);
  // Free bills left, or a month already running from an earlier run of this test.
  await expect(page.locator('[data-guide="plan"]')).toContainText(/bill muft bache|tak chalu/);
  await page.getByText('Aapka plan', { exact: true }).last().click();
  await expect(page).toHaveURL(/\/aap\/plan$/);
  await hydrated(page);
  const main = page.locator('main');
  await expect(main).toContainText('UPI ID: ekbill.test@upi');
  await expect(page.locator('[data-primary="true"]')).toHaveText(/UPI se ₹20 do/);
  await expect(page.locator('.eb-plan__qr img')).toHaveCount(1);
  const utr = `5${String(Date.now()).slice(-11)}`;
  await page.getByLabel('UPI reference number (12 ank)').fill(utr);
  await page.getByRole('button', { name: 'Payment ho gaya' }).click();
  await expect(page.getByTestId('plan-claimed')).toContainText('Shukriya!');
  await expect(main).toContainText('Mahina chalu hai');
  await expect(main).toContainText('Jaanch mein');
  // The same reference again is refused.
  await page.getByLabel('UPI reference number (12 ank)').fill(utr);
  await page.getByRole('button', { name: 'Payment ho gaya' }).click();
  await expect(main).toContainText('Yeh reference pehle hi diya ja chuka hai.');
});

test('the referral link: a friend who comes by it and sets up shows as joined on the referrer’s plan', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/dev/switch/sharma?to=/aap/plan');
  await hydrated(page);
  const link = (await page.getByTestId('referral-link').textContent())!.trim();
  expect(link).toMatch(/\/r\/[A-HJ-NP-Z2-9]{6}$/);
  const code = link.split('/r/')[1]!;
  const before = await page.locator('main').textContent();
  const joinedBefore = Number(/(\d+) jude/.exec(before ?? '')?.[1] ?? 0);
  // The friend, on another phone: the link, sign-in, Home's greeting declined, the setup.
  await page.context().clearCookies();
  await page.goto(`/r/${code}`);
  await expect(page).toHaveURL(/\/welcome$/);
  const phone = `+9195${String(Date.now()).slice(-8)}`;
  await page.goto(`/dev/switch/${encodeURIComponent(phone)}?signin=1`);
  await hydrated(page);
  await page.getByTestId('demo-no').click();
  await page.goto('/setup/name');
  await hydrated(page);
  await page.getByLabel('Aapka naam').fill('Dost');
  await page.getByLabel(/dukaan ka naam/i).fill(`Dost Stores ${code}`);
  await page.getByRole('button', { name: 'Aage' }).click();
  await page
    .getByRole('radio', { name: /Pata nahi/ })
    .first()
    .click();
  for (let i = 0; i < 6 && !(await page.getByRole('button', { name: 'Chalo, shuru karte hain' }).count()); i++) {
    const next = page.getByRole('button', { name: /^(Aage|Abhi nahi)$/ }).first();
    if (await next.count()) await next.click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: 'Chalo, shuru karte hain' }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 20_000 });
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    const r = await client.query(
      `select f.referred_by = s.id as referred from businesses f, businesses s
        where f.trade_name = $1 and s.id = '00000000-0000-4000-9000-000000000001'`,
      [`Dost Stores ${code}`],
    );
    expect(r.rows[0]?.referred).toBe(true);
  } finally {
    await client.end();
  }
  // Back as Sharma ji: one more friend joined.
  await page.goto('/dev/switch/sharma?to=/aap/plan');
  await hydrated(page);
  await expect(page.locator('main')).toContainText(`${joinedBefore + 1} jude`);
});

test('an unknown link is dropped quietly: the welcome screen, no cookie', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/r/not-a-code');
  await expect(page).toHaveURL(/\/welcome$/);
  expect((await page.context().cookies()).find((c) => c.name === 'eb-ref')).toBeUndefined();
});
