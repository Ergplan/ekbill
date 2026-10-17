import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 5: the owner adds a customer, uploads old bills and a party list,
 * ticks two of the customers found, and sees them in the directory; an
 * item is added with its SAC found by the lookup. The worker reads the
 * files (Playwright starts it with the dev server).
 */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'import', name));
const stamp = () => String(Date.now()).slice(-6);

test('add a customer, then find them in the directory and open their folder', async ({ page }) => {
  const name = `Asha Patil ${stamp()}`;
  await page.goto('/dev/switch/ravi?to=/customers/new');
  await hydrated(page);
  await page.getByLabel('Naam').fill(name);
  // The language is offered from the surname, never applied on its own.
  await page.locator('details[data-guide="more"] summary').click();
  await expect(page.getByText(/Patil — Marathi mein bhejein\?/)).toBeVisible();
  await page.getByLabel('Phone').fill(`98${String(Date.now()).slice(-8)}`);
  await page.getByRole('radio', { name: 'Marathi' }).click();
  await page.getByRole('button', { name: 'Customer jodo' }).click();
  await expect(page).toHaveURL(/\/bills\/new\?new=1/, { timeout: 15_000 });
  await page.goto('/customers');
  await hydrated(page);
  await page.getByText(name).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}/);
  await hydrated(page);
  await page.locator('details').filter({ hasText: 'Details' }).first().locator('summary').click();
  await expect(page.locator('main')).toContainText('Marathi');
});

test('import old bills and a party list: tick two, add them, see them', async ({ page }) => {
  // A party list of its own each run (two new parties and one already a customer), with the MVP's Tally invoice.
  const tag = stamp();
  const phone = (n: number) => `98${tag}${n}0`.slice(0, 10);
  const csv = [
    'Party Name,Contact Person,Mobile,City,State',
    `Rathi Agro ${tag},Suresh Rathi,${phone(1)},Nagpur,Maharashtra`,
    `Pawar Dairy ${tag},Sunil Pawar,${phone(2)},Nagpur,Maharashtra`,
    'Mehta Traders,Mehta,9822100001,Nagpur,Maharashtra',
  ].join('\n');
  await page.goto('/dev/switch/sharma?to=/customers/import');
  await hydrated(page);
  await page.locator('input.eb-filedoor').setInputFiles([
    { name: 'tally-invoice.pdf', mimeType: 'application/pdf', buffer: fixture('tally-invoice.pdf') },
    { name: `parties-${tag}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) },
    { name: 'notes.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Amount\n2026-01-01,500\n') },
  ]);
  await expect(page).toHaveURL(/state=reading&id=/);
  // The worker reads; the screen asks again until it has.
  await expect(page.getByTestId('import-row').first()).toBeVisible({ timeout: 30_000 });
  const rows = page.getByTestId('import-row');
  await expect(rows).toHaveCount(4);
  // A file that gave nobody says why, though the others found people (Stage 5 review).
  await expect(page.locator('main')).toContainText('In files se koi customer nahi mila: notes.csv');
  // Green Park (by GSTIN) and Mehta Traders (by phone) are already customers: marked, not tickable.
  await expect(rows.filter({ hasText: 'Mehta Traders' })).toContainText('Pehle se hai');
  await expect(rows.filter({ hasText: 'Green Park' })).toContainText('Pehle se hai');
  await expect(rows.filter({ hasText: 'Mehta Traders' }).locator('input')).toBeDisabled();
  // The two new ones, ticked by default.
  await page.getByRole('button', { name: '2 customers add karo' }).click();
  await expect(page).toHaveURL(/state=done/, { timeout: 15_000 });
  await expect(page.locator('main')).toContainText('2 customers jud gaye');
  await page.goto('/customers');
  await hydrated(page);
  await expect(page.locator('main')).toContainText(`Rathi Agro ${tag}`);
  await expect(page.locator('main')).toContainText(`Pawar Dairy ${tag}`);
});

test('add an item with its SAC found by the lookup', async ({ page }) => {
  const name = `Inverter service ${stamp()}`;
  await page.goto('/dev/switch/sharma?to=/items/new');
  await hydrated(page);
  await page.getByLabel('Naam').fill(name);
  await page.getByRole('button', { name: 'Dhoondo' }).click();
  await page.getByLabel('Code ya kaam ka naam').fill('repair');
  await page.getByText('SAC 9987').click();
  await expect(page.getByLabel('HSN / SAC')).toHaveValue('9987');
  await page.getByLabel('HSN / SAC').fill('998719');
  await page.getByLabel('Rate (₹)').fill('1500');
  await page.getByRole('button', { name: 'Save karo' }).click();
  await expect(page).toHaveURL(/\/items$/, { timeout: 15_000 });
  await hydrated(page);
  await expect(page.locator('main')).toContainText(name);
});
