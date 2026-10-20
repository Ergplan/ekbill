import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Details captured where the owner is (20 Oct: "I clicked that I don't have GST, then realised I do, and told the
 * voice on the bill screen"). Verma Traders is set up without GST. On the bill form the owner adds the GST number
 * right there, typed or said to the voice: it is saved on the business, this bill's GST comes on, and nobody is
 * sent to Aap. The voice runs through its stand-in (window.__ekbillVoice), as in voice.spec.ts.
 */
const DB = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev';
const VERMA = '00000000-0000-4000-9000-000000000003';
const GSTIN = '27AAPFU0939F1ZV';

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
/** Verma as the seed has him: not registered, no GSTIN, no state, no PAN. */
async function withoutGst() {
  await sql(
    "update businesses set registration_type = 'not-sure', gstin = null, state_code = null, pan = null where id = $1",
    [VERMA],
  );
}
async function registration() {
  return (await sql('select registration_type, gstin, state_code, pan from businesses where id = $1', [VERMA])).rows[0];
}
async function run(page: Page, name: string, args: Record<string, unknown> = {}) {
  return page.evaluate(
    ([n, a]) =>
      (
        window as unknown as { __ekbillVoice: { run: (n: string, a: unknown) => Promise<Record<string, unknown>> } }
      ).__ekbillVoice.run(n as string, a),
    [name, args] as const,
  );
}

test.describe.configure({ mode: 'serial' });
test.beforeEach(withoutGst);
test.afterAll(withoutGst);

test('typed on the bill form: "GST number hai?", saved on the business, this bill’s GST on, no trip to Aap', async ({
  page,
}) => {
  await page.goto('/dev/switch/verma?to=/bills/new');
  await hydrated(page);
  await page.goto('/bills/new?first=1');
  await hydrated(page);
  await expect(page.locator('[data-guide="gst"]')).toHaveCount(0);
  const add = page.locator('[data-guide="gst-add"]');
  await expect(add).toContainText('GST number hai?');
  await add.click();
  await page.getByLabel('GST number').fill('27AAPFU0939F1ZX');
  await page.getByRole('button', { name: 'GST save karo' }).click();
  // A wrong check digit is refused there, and nothing is saved.
  await expect(add).toContainText(/mel nahi khaata/);
  expect((await registration()).gstin).toBeNull();
  await page.getByLabel('GST number').fill(GSTIN);
  await page.getByRole('button', { name: 'GST save karo' }).click();
  // The bill form redraws with its GST choice, on; the page stayed the bill.
  await expect(page.locator('[data-guide="gst"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-guide="gst"]')).not.toContainText(/GST nahi|No GST/);
  await expect(page).toHaveURL(/\/bills\/new/);
  expect(await registration()).toEqual({
    registration_type: 'regular',
    gstin: GSTIN,
    state_code: '27',
    pan: 'AAPFU0939F',
  });
});

test('said to the voice on the bill form: update_business saves it there and the form follows', async ({ page }) => {
  // The voice is started on Home (on a phone the bill form has no mic of its own), then the first bill is opened.
  await page.goto('/dev/switch/verma?to=/');
  await hydrated(page);
  await page.locator('[data-guide="mic"]').click();
  await expect(page.getByTestId('voice-live')).toBeVisible();
  await page.getByRole('button', { name: 'Pehla bill banao' }).click();
  await expect(page).toHaveURL(/\/bills\/new\?first=1/);
  await expect(page.locator('[data-guide="gst-add"]')).toBeVisible();
  // "Mere paas GST hai, number 27AAPFU0939F1ZV": a bad number is answered with what is wrong, to ask again.
  const bad = await run(page, 'update_business', { field: 'gstin', value: '27AAPFU0939F1ZX' });
  expect(bad).toMatchObject({ ok: false });
  expect(String(bad.reason).length).toBeGreaterThan(5);
  const good = await run(page, 'update_business', { field: 'gstin', value: GSTIN });
  expect(good).toMatchObject({ ok: true, saved: 'gstin', registration: 'regular' });
  await expect(page.locator('[data-guide="gst"]')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/bills\/new/);
  expect((await registration()).registration_type).toBe('regular');
  // Another detail, where the owner is: their UPI ID.
  expect(await run(page, 'update_business', { field: 'upi', value: 'verma@upi' })).toMatchObject({ ok: true });
  expect((await sql('select upi from businesses where id = $1', [VERMA])).rows[0].upi).toBe('verma@upi');
  await sql('update businesses set upi = null where id = $1', [VERMA]);
});

test('staff cannot change the business: no "GST number hai?", and the voice is refused', async ({ page }) => {
  await page.goto('/dev/switch/deepak?to=/');
  await hydrated(page);
  await page.locator('[data-guide="mic"]').click();
  await expect(page.getByTestId('voice-live')).toBeVisible();
  await page.getByRole('button', { name: 'Pehla bill banao' }).click();
  await expect(page).toHaveURL(/\/bills\/new\?first=1/);
  await expect(page.locator('[data-guide="line-0"]')).toBeVisible();
  await expect(page.locator('[data-guide="gst-add"]')).toHaveCount(0);
  expect(await run(page, 'update_business', { field: 'gstin', value: GSTIN })).toMatchObject({ ok: false });
  expect((await registration()).gstin).toBeNull();
});
