import { expect, test, type Page } from '@playwright/test';

import pg from 'pg';

import { goldenPaths } from '../../apps/web/screens/golden-paths';
import { keepNewOwnerNew } from '../../packages/db/src/seed';

/**
 * Stage 6, on real data: a session's bills are documents. The MVP's bills
 * journeys on the approved screens: make a bill (the engine's total, a real
 * number, the file kept), money in part and in full, write-off and
 * reversal, cancel-and-redo and the credit note (owner only), the
 * accountant reading, a reminder opened in WhatsApp and kept; the golden
 * paths (a) and (b) counted against real bills. Sharma ji's business is
 * narangi; Gupta ji's is harmony (both themes walk a bill).
 */
const budget = (id: string) => goldenPaths.find((p) => p.id === id)!;

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function tap(page: Page, counter: { n: number }, action: () => Promise<void>) {
  await hydrated(page);
  counter.n += 1;
  await action();
}
/** A Web Share that can share files and records what it was handed (the share sheet is the hand-off). */
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: Array<{ text?: string; files?: string[] }> };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { text?: string; files?: File[] }) => {
        w.__shared.push({ text: data.text, files: (data.files ?? []).map((f) => `${f.name}:${f.type}:${f.size}`) });
        return Promise.resolve();
      },
    });
  });
}
/** A new customer on a tax invoice: the CheckStrip asks their state; at the counter it is the shop's. */
async function sameState(page: Page) {
  await page.getByRole('button', { name: 'Chuno' }).click();
  await page.getByRole('radio', { name: /Maharashtra/ }).click();
}
const shared = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shared: Array<{ text?: string; files?: string[] }> }).__shared);

test('(a) on real data: repeat bill to Mehta Traders, the PDF handed to WhatsApp: 4 taps', async ({ page }) => {
  const c = { n: 0 };
  await stubShare(page);
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  await tap(page, c, () => page.getByRole('link', { name: 'Mehta Traders' }).first().click());
  await expect(page).toHaveURL(/\/bills\/new\?customer=[0-9a-f-]{36}/);
  await tap(page, c, () => page.getByRole('button', { name: 'Haan, wahi bharo' }).click());
  await expect(page.getByRole('button', { name: /Bill banao/ })).toContainText('7,316');
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=[0-9a-f-]{36}/, { timeout: 20_000 });
  await expect(page.locator('.eb-paper')).toContainText('Mehta Traders');
  await expect(page.locator('.eb-paper')).toContainText(/INV-\d{3}/);
  await tap(page, c, () => page.getByRole('button', { name: 'WhatsApp pe bhejo' }).click());
  await expect.poll(async () => (await shared(page)).length, { timeout: 20_000 }).toBe(1);
  const [handed] = await shared(page);
  expect(handed!.text).toContain('Mehta Traders');
  expect(handed!.files![0]).toMatch(/^INV-\d{3}\.pdf:application\/pdf:\d+$/);
  expect(c.n).toBe(budget('a').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('a').budget);
});

test('(b) on real data: money came in, in full: 3 taps, and the dues move', async ({ page }) => {
  const c = { n: 0 };
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  const row = page.locator('.eb-owedrow').first();
  await expect(row).toBeVisible();
  await tap(page, c, () => row.getByRole('link').click());
  await expect(page).toHaveURL(/\/bills\/(INV|AMC)-\d{3}/);
  const number = decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!);
  await tap(page, c, () => page.getByRole('button', { name: 'Paise aa gaye' }).click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await tap(page, c, () => page.getByRole('radio', { name: /Poore/ }).click());
  await expect(page.locator('main')).toContainText('Poore aa gaye', { timeout: 15_000 });
  expect(c.n).toBe(budget('b').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('b').budget);
  // The bills list and the dues agree with the bill: it is paid.
  await page.goto('/dues');
  await hydrated(page);
  await expect(page.locator('main')).not.toContainText(number);
});

test('staff make a bill for a new customer, record part of the money; the file downloads', async ({ page }) => {
  const name = `Walk-in ${String(Date.now()).slice(-6)}`;
  await page.goto('/dev/switch/ravi?to=/bills/new?new=1');
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(name);
  await page.getByLabel('Kya kiya?').first().fill('Switchboard repair');
  await page.getByLabel('Rate (₹)').first().fill('1500');
  await sameState(page);
  await expect(page.getByRole('button', { name: /Bill banao/ })).toContainText('1,770');
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  const id = new URL(page.url()).searchParams.get('id')!;
  // The kept PDF (A4 by default) and a photo, through the roles-checked route.
  const pdf = await page.request.get(`/api/documents/${id}/file?kind=pdf&paper=a4&download=1`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect(pdf.headers()['content-disposition']).toMatch(/attachment; filename="INV-\d{3}\.pdf"/);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const jpg = await page.request.get(`/api/documents/${id}/file?kind=jpg&paper=80mm`);
  expect(jpg.headers()['content-type']).toBe('image/jpeg');

  // The bill in the list, then part of the money.
  await page.goto('/bills');
  await hydrated(page);
  await page.getByPlaceholder('Naam ya number').fill(name);
  await page.getByText(name).first().click();
  await hydrated(page);
  await expect(page.locator('main')).toContainText('1,770');
  await page.getByRole('button', { name: 'Paise aa gaye' }).click();
  await page.getByRole('radio', { name: /Kuch hissa/ }).click();
  await page.getByLabel('Kitna').fill('500');
  await page.getByRole('radio', { name: 'Cash' }).click();
  await page.getByRole('button', { name: 'Likh lo' }).click();
  await expect(page.locator('[data-guide="entries"]')).toContainText('₹500 aaye', { timeout: 15_000 });
  await expect(page.locator('main')).toContainText('1,270');
  // More than is due is refused by the engine, in words.
  await page.getByRole('button', { name: 'Paise aa gaye' }).click();
  await page.getByRole('radio', { name: /Kuch hissa/ }).click();
  await page.getByLabel('Kitna').fill('5000');
  await page.getByRole('button', { name: 'Likh lo' }).click();
  await expect(page.getByRole('alert').first()).toContainText('Baaki se zyada nahi');
  await page.keyboard.press('Escape');
  // Staff never see cancel or credit note.
  await expect(page.locator('details[data-guide="mistake"]')).toHaveCount(0);
});

test('a line naming a saved item carries its unit onto the bill', async ({ page }) => {
  await page.goto(`/dev/switch/ravi?to=/bills/new?new=1`);
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(`Unit check ${String(Date.now()).slice(-6)}`);
  await page.getByLabel('Kya kiya?').first().fill('Ceiling fan install');
  await page.getByLabel('Kitna').first().fill('2');
  await page.getByLabel('Rate (₹)').first().fill('1350');
  await sameState(page);
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await expect(page.locator('.eb-paper')).toContainText('2 nos');
});

test('a customer added earlier lends their GSTIN to nobody else’s bill (Stage 6 review)', async ({ page }) => {
  const s = String(Date.now()).slice(-6);
  await page.goto('/dev/switch/ravi?to=/customers/new');
  await hydrated(page);
  await page.getByLabel('Naam').fill(`Asha G ${s}`);
  const more = page.locator('details[data-guide="more"] summary');
  if (await more.count()) await more.click();
  await page.getByLabel('GSTIN (ho to)').fill('27AAPFU0939F1ZV');
  await page.getByRole('button', { name: 'Customer jodo' }).click();
  await expect(page).toHaveURL(/\/bills\/new\?new=1/, { timeout: 15_000 });
  // Later, in the same tab: a bill for a different new name.
  await page.goto('/bills/new?new=1');
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(`Other ${s}`);
  await page.getByLabel('Kya kiya?').first().fill('Switch repair');
  await page.getByLabel('Rate (₹)').first().fill('500');
  // The form opens in the added customer's name; once it is someone else's bill, their State is not lent either.
  await sameState(page);
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await expect(page.locator('.eb-paper')).toContainText(`Other ${s}`);
  await expect(page.locator('.eb-paper')).not.toContainText('27AAPFU0939F1ZV');
});

test('the owner writes off, reverses, credits, then cancels and redoes a bill', async ({ page }) => {
  const name = `Kale Hardware ${String(Date.now()).slice(-6)}`;
  await page.goto('/dev/switch/sharma?to=/bills/new?new=1');
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(name);
  await page.getByLabel('Kya kiya?').first().fill('Motor rewinding');
  await page.getByLabel('Rate (₹)').first().fill('10000');
  await sameState(page);
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  const number = (await page.locator('.eb-paper').innerText()).match(/INV-\d{3}/)![0];
  await page.goto(`/bills/${number}`);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('11,800');

  // "Kam karo": ₹800 written off.
  await page.getByRole('button', { name: 'Kam karo' }).click();
  await page.locator('#adjust-amount').fill('800');
  await page.getByRole('dialog').getByRole('button', { name: 'Kam karo' }).click();
  await expect(page.locator('[data-guide="entries"]')).toContainText('₹800 chhoda', { timeout: 15_000 });
  await expect(page.locator('main')).toContainText('11,000');
  // A mistake undone, with a reason; it stays on the record.
  await page.getByRole('button', { name: 'Galat hai? Hatao' }).click();
  await page.locator('#reverse-reason').fill('Galti se');
  await page.getByRole('button', { name: 'Hatao', exact: true }).click();
  await expect(page.locator('[data-guide="entries"]')).toContainText('Hata diya: Galti se', { timeout: 15_000 });
  await expect(page.locator('main')).toContainText('11,800');

  // Cancel and redo: the lines come back on a fresh bill with a new number.
  await page.locator('details[data-guide="mistake"] summary').click();
  await page.getByRole('button', { name: 'Cancel karke naya banao' }).click();
  await page.locator('#cancel-reason').fill('Wrong rate');
  await page.getByRole('button', { name: 'Cancel karo, naya kholo' }).click();
  await expect(page).toHaveURL(/\/bills\/new\?.*redo=/, { timeout: 15_000 });
  await hydrated(page);
  await expect(page.getByLabel('Kya kiya?').first()).toHaveValue('Motor rewinding');
  await page.getByLabel('Rate (₹)').first().fill('9000');
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  const redo = (await page.locator('.eb-paper').innerText()).match(/INV-\d{3}/)![0];
  expect(redo).not.toBe(number);
  await page.goto(`/bills/${number}`);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Cancel ho gaya · Wrong rate');

  // A credit note for ₹1,180 on the new bill (tax-inclusive, the bill's 18 %): ₹10,620 less ₹1,180.
  await page.goto(`/bills/${redo}`);
  await hydrated(page);
  await page.locator('details[data-guide="mistake"] summary').click();
  await page.getByRole('button', { name: 'Rakam kam karo' }).click();
  await hydrated(page);
  await page.getByLabel('Kitna kam').fill('1180');
  await page.locator('#cn-reason').fill('Old motor taken back');
  await page.getByRole('button', { name: 'Credit note banao' }).click();
  await expect(page.locator('main')).toContainText(/Credit note ban gaya: CN-\d{3}/, { timeout: 15_000 });
  await page.goto(`/bills/${redo}`);
  await hydrated(page);
  await expect(page.locator('main')).toContainText(/Credit note CN-\d{3} · ₹1,180 · Old motor taken back/);
  await expect(page.locator('main')).toContainText('9,440');
  // Corrected by a credit note: no cancel on top of it.
  await page.locator('details[data-guide="mistake"] summary').click();
  await expect(page.getByRole('button', { name: 'Cancel karke naya banao' })).toHaveCount(0);
});

test('a composition business (harmony) issues a bill of supply; the reminder is opened and kept', async ({ page }) => {
  await stubShare(page);
  await page.goto('/dev/switch/sunita?to=/bills/new?new=1');
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(`Sharma Tiffin ${String(Date.now()).slice(-6)}`);
  await page.getByLabel('Kya kiya?').first().fill('Atta 10 kg');
  await page.getByLabel('Rate (₹)').first().fill('450');
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await expect(page.locator('.eb-paper')).toContainText('BILL OF SUPPLY');
  await expect(page.locator('.eb-paper')).toContainText(/BOS-\d{3}/);
  await expect(page.locator('.eb-paper')).not.toContainText('CGST');
  const number = (await page.locator('.eb-paper').innerText()).match(/BOS-\d{3}/)![0];

  await page.goto(`/bills/${number}/remind`);
  await hydrated(page);
  await page.getByRole('button', { name: 'WhatsApp kholo' }).click();
  await expect.poll(async () => (await shared(page)).length, { timeout: 20_000 }).toBe(1);
  await page.goto(`/bills/${number}`);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('1 baar yaad dilaya');
});

test('the accountant reads bills and downloads files, and records nothing', async ({ page }) => {
  await page.goto('/dev/switch/meera?to=/bills');
  await hydrated(page);
  await page.getByText('INV-039').first().click();
  await hydrated(page);
  await expect(page.getByRole('button', { name: 'Paise aa gaye' })).toHaveCount(0);
  await expect(page.locator('details[data-guide="mistake"]')).toHaveCount(0);
  const pdf = await page.request.get('/api/documents/INV-039/file?kind=pdf&paper=a5');
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await page.goto('/bills/new');
  await expect(page).toHaveURL(/\/$|\/\?/);
});

test('another business cannot fetch a bill file', async ({ page }) => {
  await page.goto('/dev/switch/gupta?to=/');
  await hydrated(page);
  expect((await page.request.get('/api/documents/INV-031/file?kind=pdf&paper=a4')).status()).toBe(404);
});

// Stage 11, found by the clean-clone run: every new business numbers with the year (INV-2026-27/001), and the
// slash in it broke every link to the bill. A new owner's first bill opens from the list, its reminder and back.
test('a new business numbers with the year, and its bill opens from the list, the reminder and back', async ({
  page,
}) => {
  try {
    await newBusinessBill(page);
  } finally {
    // Naya owner is brand new again for the journeys after this one (golden path (d), the setup).
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev',
    });
    await client.connect();
    try {
      await client.query('begin');
      await keepNewOwnerNew(client);
      await client.query('commit');
    } finally {
      await client.end();
    }
  }
});

async function newBusinessBill(page: Page) {
  await page.goto(`/dev/switch/new?to=${encodeURIComponent('/setup/name')}`);
  await hydrated(page);
  await page.getByLabel(/dukaan ka naam/i).fill(`Saal Traders ${String(Date.now()).slice(-6)}`);
  await page.getByRole('button', { name: 'Aage' }).click();
  await page.getByRole('radio', { name: 'Composition mein hoon' }).click();
  await page.getByLabel('GST number').fill('09AAACG1234A1ZC');
  await page.getByRole('button', { name: 'Aage' }).click();
  await page.getByRole('button', { name: 'Chalo, shuru karte hain' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });

  const customer = `Saal ${String(Date.now()).slice(-6)}`;
  await page.goto('/bills/new?new=1');
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(customer);
  await page.getByLabel('Kya kiya?').first().fill('Tiffin, October');
  await page.getByLabel('Rate (₹)').first().fill('2400');
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  const id = new URL(page.url()).searchParams.get('id')!;
  await expect(page.locator('main')).toContainText(/INV-\d{4}-\d{2}\/001/);
  const number = (await page.locator('main').innerText()).match(/INV-\d{4}-\d{2}\/001/)![0];

  // The file keeps a name a phone can save.
  const pdf = await page.request.get(`/api/documents/${id}/file?kind=pdf&paper=a4&download=1`);
  expect(pdf.headers()['content-disposition']).toContain(`filename="${number.replace('/', '-')}.pdf"`);

  // From the list to the bill: one path segment, and the bill, not "Yeh mila nahi".
  await page.goto('/bills');
  await hydrated(page);
  await page.getByText(customer).first().click();
  await expect(page).toHaveURL(new RegExp(`/bills/${encodeURIComponent(number)}\\?fy=\\d{4}-\\d{2}$`));
  await hydrated(page);
  await expect(page.locator('main')).toContainText(number);
  await expect(page.locator('main')).toContainText('2,400');

  // Its reminder, and back to the bill.
  await page.getByRole('button', { name: 'Yaad dilao' }).click();
  await expect(page).toHaveURL(new RegExp(`/bills/${encodeURIComponent(number)}/remind`));
  await hydrated(page);
  await expect(page.locator('main')).toContainText(customer);
  await page.goBack();
  await expect(page.locator('main')).toContainText(number);
}
