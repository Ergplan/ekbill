import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Kaccha bill and pakka bill (20 Oct, the operator: "kaccha bill in India refers to estimates which are sent before
 * the exact invoice for the buyer to check, and some street vendors only give a kaccha bill"), and the bill sent
 * straight to a number typed in the app ("the shopkeeper may not have the new customer's number stored in WhatsApp").
 * Sharma ji makes an estimate for a new customer from Home's second opening button, sends it to the number typed,
 * makes the pakka bill from it with one tap; the customer opens the bill's own link with no sign-in.
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
/** window.open recorded instead of opened: the wa.me door the WhatsApp button goes through. */
async function stubOpen(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = ((url?: string | URL) => {
      w.__opened.push(String(url));
      return { opener: null } as unknown as Window;
    }) as typeof window.open;
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

test('Home: two opening buttons, and the guide says which is which', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  await expect(page.locator('[data-guide="star"]')).toContainText('Pakka bill banao (tax invoice)');
  await expect(page.locator('[data-guide="kaccha"]')).toContainText('Kaccha bill banao (estimate)');
  await expect(page.getByText(/Kaccha bill = estimate/)).toBeVisible();
  await page.getByTestId('tour').first().click();
  await expect(page.locator('.eb-guide__caption')).toContainText('Pakka bill: asli bill');
  await page.locator('.eb-guide__next').click();
  await expect(page.locator('.eb-guide__caption')).toContainText('Kaccha bill yaani estimate');
});

test('a kaccha bill for a new customer, sent to the number typed, made pakka in one tap; the link opens it', async ({
  page,
  browser,
}) => {
  await stubOpen(page);
  const name = `Kaccha Customer ${Date.now() % 100000}`;
  // A number nobody in the shop has yet: 98 then eight digits from the clock.
  const digits = `98${String(Date.now()).slice(-8)}`;
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  await page.locator('[data-guide="kaccha"]').click();
  await expect(page).toHaveURL(/\/bills\/new\?kaccha=1/);
  await expect(page.getByRole('heading', { name: 'Naya estimate' })).toBeVisible();
  await page.locator('[data-guide="new"]').click();
  await expect(page).toHaveURL(/\/customers\/new\?kaccha=1/);
  await hydrated(page);
  await page.getByLabel('Naam', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Customer jodo' }).click();
  await expect(page).toHaveURL(/kaccha=1/);
  await hydrated(page);
  await expect(page.getByRole('radio', { name: 'Kaccha (estimate)' })).toBeChecked();
  await page.getByLabel('Kya kiya?').first().fill('Shop wiring');
  await page.getByLabel('Rate (₹)').first().fill('9000');
  await expect(page.getByText(/GST return aur paise aane hain mein nahi judta/)).toBeVisible();
  await page.getByRole('button', { name: /Estimate banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await expect(page.getByText('Estimate ban gaya!').first()).toBeVisible();
  await expect(page.locator('.eb-paper')).toContainText('ESTIMATE');
  await expect(page.locator('.eb-paper')).toContainText(/EST-\d{3}/);
  const estimate = (await page.locator('.eb-paper').textContent())!.match(/EST-\d{3}/)![0];

  // WhatsApp to the number typed: the chat with that number opens, with the message and the bill's own link.
  await page.getByLabel('Customer ka WhatsApp number').fill(`${digits.slice(0, 5)} ${digits.slice(5)}`);
  await page.getByRole('button', { name: 'WhatsApp pe bhejo' }).click();
  await expect(page.getByTestId('wa-opened')).toBeVisible();
  const [url] = await opened(page);
  expect(url).toMatch(new RegExp(`^https://wa\\.me/91${digits}\\?text=`));
  const text = decodeURIComponent(url!.split('?text=')[1]!);
  expect(text).toContain(`estimate ${estimate}`);
  const link = text.match(/https?:\/\/\S+\/b\/[A-Za-z0-9_-]{22}/)![0];
  // The number is kept on the customer for next time.
  await expect
    .poll(async () => (await sql('select phone from customers where name = $1', [name])).rows[0]?.phone)
    .toBe(`+91${digits}`);

  // The customer opens the link: no sign-in, this bill only, its picture and its PDF.
  const visitor = await browser.newContext();
  const theirs = await visitor.newPage();
  await theirs.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(theirs.getByTestId('bill-link')).toContainText(`ESTIMATE ${estimate}`);
  await expect(theirs.getByText('Yeh kaccha bill (estimate) hai. Pakka bill baad mein aayega.')).toBeVisible();
  const token = link.split('/b/')[1]!;
  const pdf = await theirs.request.get(`/b/${token}/file?kind=pdf&paper=a4`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await theirs.request.get('/b/AAAAAAAAAAAAAAAAAAAAAA')).status()).toBe(404);
  await visitor.close();

  // Not a sale: it is in no dues and in no bills list; it is under Kaccha.
  await page.getByRole('button', { name: 'Pakka bill banao' }).click();
  await expect(page).toHaveURL(/\/bills\/new\?from=/);
  await hydrated(page);
  await expect(page.getByText(`Estimate ${estimate} se pakka bill`)).toBeVisible();
  await expect(page.getByLabel('Kya kiya?').first()).toHaveValue('Shop wiring');
  // A new customer on a tax invoice: the CheckStrip asks their State; at the counter it is the shop's.
  await page.getByRole('button', { name: 'Chuno' }).click();
  await page.getByRole('radio', { name: /Maharashtra/ }).click();
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await expect(page.getByText('Bill ban gaya!').first()).toBeVisible();
  const bill = (await page.locator('.eb-paper').textContent())!.match(/INV-\d{3}/)![0];
  // The number typed before is the customer's now: the field has it.
  await expect(page.getByLabel('Customer ka WhatsApp number')).toHaveValue(`+91${digits}`);

  await page.goto(`/bills/${bill}`);
  await hydrated(page);
  await expect(page.getByText(`Estimate ${estimate} se bana`)).toBeVisible();
  await page.goto(`/bills/${estimate}`);
  await hydrated(page);
  await expect(page.getByRole('heading', { name: 'Kaccha bill (estimate)' })).toBeVisible();
  await expect(page.getByText(`Pakka bill ban gaya: ${bill}`)).toBeVisible();
  await expect(page.locator('[data-guide="paid"]')).toHaveCount(0);

  await page.goto('/bills');
  await hydrated(page);
  await expect(page.locator('[data-guide="list"]')).not.toContainText(estimate);
  await page.getByRole('radio', { name: 'Kaccha (estimate)' }).click();
  const row = page.locator('[data-guide="list"] a').filter({ hasText: estimate });
  await expect(row).toContainText('Pakka ban gaya');
  await page.goto('/dues');
  await hydrated(page);
  await expect(page.locator('body')).not.toContainText(estimate);
});

test('the voice opens a kaccha bill when the owner asks for an estimate', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  await page.locator('[data-guide="mic"]').click();
  await expect(page.getByTestId('voice-live')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __ekbillVoice: { run: (n: string, a: unknown) => Promise<unknown> } }).__ekbillVoice.run(
      'start_bill',
      { customer_name: 'Mehta Traders', lines: [{ what: 'Panel check', rate: 800 }], kaccha: true },
    ),
  );
  await expect(page).toHaveURL(/kaccha=1/);
  await expect(page.getByRole('radio', { name: 'Kaccha (estimate)' })).toBeChecked();
  await expect(page.getByLabel('Kya kiya?').first()).toHaveValue('Panel check', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /Estimate banao/ })).toBeVisible();
});
