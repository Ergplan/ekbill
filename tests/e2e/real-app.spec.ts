import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * The operator's evening walk of the VM (20 Oct): "give us a real application to test everything, not a dummy one;
 * if OTP is not linked, just say proceed without mobile registration"; "each item has different GST, do not club
 * the GST, and GST should be item-wise by default"; "the bottom navigation is missing on the bill screen"; "there is
 * no bill editing button right after the bill is made".
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

test("signed out, no sample shop: the welcome, and an account of one's own without a mobile", async ({ page }) => {
  await page.context().clearCookies();
  for (const path of ['/', '/aap', '/bills', '/bills/new']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/welcome$/);
  }
  await hydrated(page);
  await page.locator('[data-guide="guest"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await hydrated(page);
  // A person of their own, new: the greeting offers the demo, and "Apne baare mein batao" leads to their own shop.
  await page.getByTestId('demo-no').click();
  await expect(page.locator('[data-guide="about"]')).toBeVisible();
  await expect(page.getByText('Bansal Agencies')).toHaveCount(0);
});

test('with SMS off, a number typed on the sign-in is the account, signed in at once', async ({ page }) => {
  await page.context().clearCookies();
  const digits = `97${String(Date.now()).slice(-8)}`;
  await page.goto('/login');
  await hydrated(page);
  await expect(page.getByText(/SMS code abhi chalu nahi hai/)).toBeVisible();
  await page.locator('#phone').fill(digits);
  await page.locator('#otp-send').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  expect((await sql('select count(*)::int as n from users where phone_e164 = $1', [`+91${digits}`])).rows[0].n).toBe(1);
});

test('GST item by item: each line its own rate from the start, the bill says each rate, and the heads are per rate', async ({
  page,
}) => {
  await page.goto('/dev/switch/sharma?to=/bills/new?new=1');
  await hydrated(page);
  // The bottom navigation stays on the bill form.
  await expect(page.locator('.eb-tabbar')).toBeVisible();
  await page.getByLabel('Customer ka naam').fill(`GST Lines ${Date.now() % 10000}`);
  await page.getByLabel('Kya kiya?').first().fill('Rice bag');
  await page.getByLabel('Rate (₹)').first().fill('1000');
  // Each line has its rate chips at once, no "alag alag" to choose first.
  const first = page.locator('[data-guide="line-0"]');
  await first.getByRole('radio', { name: '5%' }).click();
  await page.locator('[data-guide="add"]').click();
  await page.getByLabel('Kya kiya?').nth(1).fill('Ceiling fan');
  await page.getByLabel('Rate (₹)').nth(1).fill('2000');
  await expect(page.locator('[data-guide="line-1"]').getByRole('radio', { name: '18%' })).toBeChecked();
  await page.getByRole('button', { name: 'Chuno' }).click();
  await page.getByRole('radio', { name: /Maharashtra/ }).click();
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  const paper = page.locator('.eb-paper');
  await expect(paper.locator('th', { hasText: 'GST' })).toBeVisible();
  await expect(paper).toContainText('5%');
  await expect(paper).toContainText('18%');
  for (const head of ['CGST 2.5%', 'SGST 2.5%', 'CGST 9%', 'SGST 9%']) await expect(paper).toContainText(head);
  await expect(page.locator('.eb-tabbar')).toBeVisible();

  // "Bill badlo": the owner cancels it here and the form opens again with the same customer and lines.
  const number = (await paper.textContent())!.match(/INV-\d{3}/)![0];
  await page.locator('[data-guide="edit"]').click();
  await page.getByRole('button', { name: 'Haan, badlo' }).click();
  await expect(page).toHaveURL(/\/bills\/new\?.*redo=/);
  await hydrated(page);
  await expect(page.getByLabel('Kya kiya?').first()).toHaveValue('Rice bag');
  await expect(page.getByLabel('Kya kiya?').nth(1)).toHaveValue('Ceiling fan');
  expect(
    (
      await sql(
        "select status from documents where number = $1 and status <> 'draft' order by issued_at desc limit 1",
        [number],
      )
    ).rows[0].status,
  ).toBe('cancelled');
});

test('staff see no "Bill badlo" (cancel is the owner\'s)', async ({ page }) => {
  await page.goto('/dev/switch/ravi?to=/bills/new?new=1');
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(`Staff Bill ${Date.now() % 10000}`);
  await page.getByLabel('Kya kiya?').first().fill('Repair');
  await page.getByLabel('Rate (₹)').first().fill('500');
  await page.getByRole('button', { name: 'Chuno' }).click();
  await page.getByRole('radio', { name: /Maharashtra/ }).click();
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await hydrated(page);
  await expect(page.locator('[data-guide="edit"]')).toHaveCount(0);
});
