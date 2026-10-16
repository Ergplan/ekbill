import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

import { goldenPaths } from '../../apps/web/screens/golden-paths';

/**
 * Stage 7 on real data: a photographed kaccha bill goes to the server, the
 * worker reads it (the fake model, which answers the synthetic set: no model
 * is called from a test), the owner reviews the fields with their
 * confidences, corrects one, and makes the bill; the correction is a row.
 * Golden path (c) counted. The blurred photo and the photo of no bill say why.
 */
const budget = (id: string) => goldenPaths.find((p) => p.id === id)!;
const photo = (name: string) => ({
  name: `${name}.jpg`,
  mimeType: 'image/jpeg',
  buffer: readFileSync(join(__dirname, '..', 'fixtures', 'bills', 'synthetic', `${name}.jpg`)),
});
const DB = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev';

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function tap(page: Page, counter: { n: number }, action: () => Promise<void>) {
  await hydrated(page);
  counter.n += 1;
  await action();
}
async function pickPhoto(page: Page, name: string, counter?: { n: number }) {
  const choose = () => page.getByRole('radio', { name: 'Photo lo' }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    counter ? tap(page, counter, choose) : hydrated(page).then(choose),
  ]);
  await chooser.setFiles(photo(name));
}

test('(c) on real data: a kaccha bill photographed and made: 3 taps plus the picker', async ({ page }) => {
  const c = { n: 0 };
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  await tap(page, c, () => page.getByRole('link', { name: 'Photo se bill' }).click());
  await expect(page).toHaveURL(/\/bills\/photo/);
  await pickPhoto(page, 'kaccha-01', c);
  await expect(page).toHaveURL(/\/bills\/photo\?id=[0-9a-f-]{36}/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Yeh samjha. Sahi hai?' })).toBeVisible({ timeout: 30_000 });
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await expect(page.locator('.eb-paper')).toContainText(/INV-\d{3}/);
  expect(c.n).toBe(budget('c').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('c').budget);
});

test('staff review the reading: confidences shown, a doubtful rate corrected, the correction kept', async ({
  page,
}) => {
  await page.goto('/dev/switch/ravi?to=/bills/photo');
  await pickPhoto(page, 'kaccha-03'); // Joshi Builders; the fake model is unsure of the first rate (0.55)
  await expect(page.getByRole('heading', { name: 'Yeh samjha. Sahi hai?' })).toBeVisible({ timeout: 30_000 });
  const id = new URL(page.url()).searchParams.get('id')!;
  await expect(page.locator('#pf-customer')).toHaveValue('Joshi Builders');
  await expect(page.locator('.eb-conf--high').filter({ has: page.locator('#pf-customer') })).toHaveCount(1);
  await expect(page.locator('.eb-conf--low').filter({ has: page.locator('#pf-rate-0') })).toHaveCount(1);
  await expect(page.locator('main')).toContainText('Joshi Builders se mila (100%)');
  // The photo the model saw is served to the screen.
  expect((await page.request.get(`/api/extractions/${id}/image`)).headers()['content-type']).toBe('image/jpeg');
  // Correct the rate; the engine's total follows (₹350 × 4 + ₹310 = ₹1,710, with 18 % GST ₹2,017.80).
  await page.locator('#pf-rate-0').fill('350');
  await expect(page.getByRole('button', { name: /Bill banao/ })).toContainText('2,017');
  await page.getByRole('button', { name: /Bill banao/ }).click();
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/, { timeout: 20_000 });
  await expect(page.locator('.eb-paper')).toContainText('Joshi Builders');
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    const { rows } = await client.query(
      'select field, model_value, human_value from extraction_corrections where extraction_id = $1 order by field',
      [id],
    );
    expect(rows).toEqual([{ field: 'lines.0.rate', model_value: '340', human_value: '350' }]);
    const { rows: ex } = await client.query('select status, committed_document_id from extractions where id = $1', [
      id,
    ]);
    expect(ex[0].status).toBe('committed');
    expect(ex[0].committed_document_id).not.toBeNull();
  } finally {
    await client.end();
  }
  // Coming back to the reading goes to the bill it made.
  await page.goto(`/bills/photo?id=${id}`);
  await expect(page).toHaveURL(/\/bills\/new\/done\?id=/);
});

test('an unreadable date is lit and empty; a blurred photo and a photo of no bill say why', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/bills/photo');
  await pickPhoto(page, 'kaccha-06'); // the fake model could not read its date
  await expect(page.getByRole('heading', { name: 'Yeh samjha. Sahi hai?' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#pf-date')).toHaveValue('');
  await expect(page.locator('.eb-conf--none').filter({ has: page.locator('#pf-date') })).toHaveCount(1);

  await page.goto('/bills/photo');
  await pickPhoto(page, 'blurred');
  await expect(page.getByText('Photo saaf nahi aayi, dobara lo')).toBeVisible({ timeout: 30_000 });
  await page.goto('/bills/photo');
  await pickPhoto(page, 'not-a-bill');
  await expect(page.getByText('Isme bill nahi mila')).toBeVisible({ timeout: 30_000 });
});
