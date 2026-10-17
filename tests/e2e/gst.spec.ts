import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

/**
 * Stage 8 on real data: a regular business opens a quarter, drills from a
 * figure into the bills behind it, shares the CA pack (the zip goes to the
 * share sheet), and on a bill sees a check and taps "Kyun?" for the rule.
 */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: Array<{ name: string; type: string; size: number }> };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { files?: File[] }) => {
        for (const f of data.files ?? []) w.__shared.push({ name: f.name, type: f.type, size: f.size });
        return Promise.resolve();
      },
    });
  });
}
const money = (s: string) => Number(s.replace(/[^\d.-]/g, ''));

test('a quarter: the tiles, a drill-down that adds up, B2B, and the CA pack shared', async ({ page }) => {
  await stubShare(page);
  await page.goto('/dev/switch/sharma?to=/gst?period=quarter%26q=2026-07');
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Jul-Sep 2026-27');
  // The 18 % row drills into its bills; their taxable values add up to the row.
  const row = page.locator('[data-guide="rates"] tbody tr').filter({ hasText: '18%' });
  const rowTaxable = money((await row.locator('td').nth(1).innerText()) ?? '0');
  await row.click();
  await expect(page).toHaveURL(/\/gst\/docs\?from=2026-07&to=2026-09&table=rate&rate=1800/);
  await hydrated(page);
  const rows = page.getByTestId('drill-row');
  expect(await rows.count()).toBeGreaterThan(3);
  expect(Math.round(money(await page.getByTestId('drill-taxable').innerText()))).toBe(Math.round(rowTaxable));
  // B2B: every document has a GSTIN customer.
  await page.goto('/gst/docs?from=2026-07&to=2026-09&table=b2b');
  await hydrated(page);
  await expect(page.getByTestId('drill-row').first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Company bills (B2B)');
  // More than a year is refused, never cut short under the asked range (Stage 8 review).
  expect((await page.request.get('/gst/docs?from=2025-01&to=2026-02&table=all')).status()).toBe(404);
  // The pack: a zip with the workings, gstr1.json and the bills, handed to the share sheet.
  await page.goto('/gst?period=quarter&q=2026-07');
  await hydrated(page);
  await page.getByRole('button', { name: 'CA ko bhejo' }).click();
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length), {
      timeout: 60_000,
    })
    .toBe(1);
  const [file] = await page.evaluate(
    () => (window as unknown as { __shared: Array<{ name: string; type: string; size: number }> }).__shared,
  );
  expect(file).toMatchObject({ name: 'GST-2026-07-2026-09.zip', type: 'application/zip' });
  const zip = await page.request.get('/api/gst/pack?from=2026-07&to=2026-09');
  const names = Object.keys(unzipSync(new Uint8Array(await zip.body())));
  expect(names).toEqual(expect.arrayContaining(['workings.xlsx', 'gstr1.json', 'README.txt', 'bills/INV-031.pdf']));
});

test('staff see the GST tab but do not send the pack', async ({ page }) => {
  await page.goto('/dev/switch/ravi?to=/gst');
  await hydrated(page);
  await expect(page.getByRole('button', { name: 'CA ko bhejo' })).toHaveCount(0);
  expect((await page.request.get('/api/gst/pack?from=2026-07&to=2026-09')).status()).toBe(403);
});

test('a bill shows its check as it is typed, and "Kyun?" gives the rule', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/bills/new?new=1');
  await hydrated(page);
  await page.getByLabel('Customer ka naam').fill(`Walk-in ${String(Date.now()).slice(-6)}`);
  await page.getByLabel('Kya kiya?').first().fill('Transformer');
  await page.getByLabel('Rate (₹)').first().fill('60000');
  await page.getByRole('button', { name: 'Chuno' }).click();
  await page.getByRole('radio', { name: /Maharashtra/ }).click();
  // ₹70,800 to a walk-in with no address: the B2C recipient-details check, with its rule.
  const strip = page.locator('[data-guide="checks"]');
  await expect(strip).toContainText(/50,?000/);
  await expect(page.getByRole('button', { name: /Bill banao/ })).toBeDisabled();
  await strip.getByRole('button', { name: 'Kyun?' }).first().click();
  await expect(page.getByTestId('why-text')).toBeVisible();
  await expect(page.getByTestId('why-text')).toContainText('50,000');
  await expect(page.getByRole('dialog')).toContainText('Niyam:');
});
