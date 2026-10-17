import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 4: the setup end to end for a brand-new owner, with a drawn signature,
 * in both themes; the composition and "Pata nahi" branches; Aap shows what
 * was saved and Save works once; the sample bill carries logo and signature.
 */
const THEMES = ['narangi', 'harmony'] as const;

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function become(page: Page, person: string, to: string, theme: string) {
  // The switch echoes the person's own theme into the cookie; the journey's theme is set after it.
  await page.goto(`/dev/switch/${person}?to=${encodeURIComponent(to)}`);
  await page.context().addCookies([{ name: 'eb-theme', value: theme, url: 'http://127.0.0.1:3000' }]);
  await page.goto(to);
  await hydrated(page);
}
async function draw(page: Page) {
  const canvas = page.locator('.eb-sigpad__canvas');
  const box = (await canvas.boundingBox())!;
  const x = box.x + 30;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + i * 14, y + Math.sin(i) * 18, { steps: 3 });
  await page.mouse.up();
}
/** A 1×1 transparent PNG, the logo the test uploads. */
const LOGO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

for (const theme of THEMES) {
  test(`a brand-new owner sets up a regular business with a signature (${theme})`, async ({ page }) => {
    await become(page, 'new', '/setup/name', theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByLabel(/dukaan ka naam/i).fill(`Naya Traders ${theme}`);
    await page.getByRole('button', { name: 'Aage' }).click();
    await page.getByRole('radio', { name: 'Haan' }).first().click();
    await page.getByLabel('GST number').fill('27AAPFU0939F1ZV');
    await page.getByRole('button', { name: 'Aage' }).click();
    await page.getByRole('radio', { name: /1\.5 – 5 crore/ }).click();
    // Sab sahi hai? The derived state is on the review; PAN, UPI, city and the signature are offered.
    await expect(page.locator('main')).toContainText('Maharashtra');
    await page.getByRole('button', { name: 'Abhi bhar deta hoon' }).click();
    await expect(page.getByLabel('PAN')).toHaveValue('AAPFU0939F');
    await page.getByRole('button', { name: 'Aage' }).click();
    await page.getByLabel('UPI ID').fill('naya@upi');
    await page.getByRole('button', { name: 'Aage' }).click();
    await page.getByLabel('Sheher').fill('Nagpur');
    await page.getByRole('button', { name: 'Aage' }).click();
    await draw(page);
    await page.getByRole('button', { name: 'Aage' }).click();
    await expect(page.locator('main')).toContainText('naya@upi');
    await page.getByRole('button', { name: 'Chalo, shuru karte hain' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await hydrated(page);
    await expect(page.locator('main')).toContainText(`Naya Traders ${theme}`);
    // Aap shows everything that was saved.
    await page.goto('/aap');
    await hydrated(page);
    const main = page.locator('main');
    await expect(main).toContainText('27AAPFU0939F1ZV');
    await expect(main).toContainText('AAPFU0939F');
    await expect(main).toContainText('naya@upi');
    await expect(main).toContainText('Maharashtra');
    await expect(main).toContainText('1.5 – 5 crore');
    await expect(main.locator('img.eb-logo-preview')).toHaveCount(1); // the signature preview
  });
}

test('the composition branch: GSTIN, the legend on the review, no turnover question', async ({ page }) => {
  await become(page, 'new', '/setup/name', 'narangi');
  await page.getByLabel(/dukaan ka naam/i).fill('Naya Composition');
  await page.getByRole('button', { name: 'Aage' }).click();
  await page.getByRole('radio', { name: 'Composition mein hoon' }).click();
  await page.getByLabel('GST number').fill('09AAACG1234A1ZC');
  await page.getByRole('button', { name: 'Aage' }).click();
  await expect(page.locator('main')).toContainText('not eligible to collect tax');
  await expect(page.locator('main')).not.toContainText('Saal ka dhandha');
  await page.getByRole('button', { name: 'Chalo, shuru karte hain' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.goto('/aap');
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Composition');
  await expect(page.locator('main')).toContainText('not eligible to collect tax');
});

test('the "Pata nahi" branch: three questions and the app opens', async ({ page }) => {
  await become(page, 'verma', '/setup/name', 'harmony');
  await page.getByLabel(/dukaan ka naam/i).fill('Verma Traders');
  await page.getByRole('button', { name: 'Aage' }).click();
  await page.getByRole('radio', { name: 'Pata nahi' }).click();
  await expect(page.locator('main')).toContainText('Sab sahi hai');
  await page.getByRole('button', { name: 'Chalo, shuru karte hain' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Verma Traders');
});

test('Aap: the owner edits the shop, Save works once, staff cannot save; the logo lands on the sample', async ({
  page,
}) => {
  await become(page, 'sharma', '/aap', 'narangi');
  const main = page.locator('main');
  await expect(main).toContainText('Sharma Electricals');
  // Nothing changed yet.
  await page.getByRole('button', { name: 'Save karo' }).click();
  await expect(page.getByTestId('aap-notice')).toContainText('Kuch badla nahi');
  // Edit the shop: a PIN code and an email this run alone would pick, then save once.
  const stamp = String(Date.now()).slice(-5);
  await page.getByText('Naam', { exact: true }).first().click();
  // One primary on the screen (I9, Stage 4 review): with the sheet open it is the sheet's, not Save.
  await expect(page.locator('[data-primary="true"]:visible')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Save karo' })).toHaveCount(0);
  await page.getByLabel('PIN code').fill(`4${stamp}`);
  await page.getByLabel('Email').fill(`sharma+${stamp}@example.com`);
  await page.getByRole('button', { name: 'Theek hai' }).click();
  await page.getByRole('button', { name: 'Save karo' }).click();
  await expect(page.getByTestId('aap-notice')).toContainText('Save ho gaya');
  await expect(page.getByRole('button', { name: 'Save ho gaya' })).toBeDisabled();
  // A wrong PIN is refused with the field named.
  await page.getByText('Naam', { exact: true }).first().click();
  await page.getByLabel('PIN code').fill('12');
  await page.getByRole('button', { name: 'Theek hai' }).click();
  await page.getByRole('button', { name: 'Save karo' }).click();
  await expect(page.getByTestId('aap-notice')).toContainText('PIN code 6 digit');
  await page.getByText('Naam', { exact: true }).first().click();
  await page.getByLabel('PIN code').fill(`4${stamp}`);
  await page.getByRole('button', { name: 'Theek hai' }).click();
  // The logo: picked from the files folder, stored, shown on the sample bill with the signature.
  await page
    .locator('input.eb-filedoor')
    .first()
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO_PNG });
  await expect(main.locator('img.eb-logo-preview').first()).toBeVisible();
  await page.getByText('Signature', { exact: true }).first().click();
  await draw(page);
  await page.getByRole('button', { name: 'Theek hai' }).click();
  await page.getByText('Sample dekho').click();
  await expect(page).toHaveURL(/\/bills\/new\/done/);
  await hydrated(page);
  await expect(page.locator('.eb-paper__logo')).toBeVisible();
  await expect(page.locator('.eb-paper__sign-img')).toBeVisible();
  await expect(page.locator('.eb-paper__sign')).toContainText('For Sharma Electricals');
  // Staff see the business read-only: no Save.
  await become(page, 'ravi', '/aap', 'narangi');
  await expect(page.getByRole('button', { name: 'Save karo' })).toHaveCount(0);
  // Read-only means the voice switch does not move for them either (Stage 4 review).
  const voice = page.getByRole('radiogroup', { name: 'Bolke' });
  const before = await voice.getByRole('radio', { checked: true }).innerText();
  await voice.getByRole('radio', { name: before.includes('Chalu') ? 'Band' : 'Chalu' }).click();
  await expect(voice.getByRole('radio', { checked: true })).toHaveText(before);
  await expect(page.locator('main')).toContainText('Sharma Electricals');
});
