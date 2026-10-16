import { expect, test, type Page } from '@playwright/test';

/**
 * The doors to the person's own things: camera, photo library, files
 * folder. Each is the OS's own picker (the OS asks for permission), so the
 * tests set the hidden inputs' files the way the picker would, and walk
 * the laptop's live camera against Chromium's fake device.
 */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}

// A 2×2 PNG (red), enough for the canvas to draw.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'eb-theme', value: 'narangi', url: 'http://127.0.0.1:3000' }]);
});

test('photo bill: a photo from the library is read into the draft and shown on the review', async ({ page }) => {
  await page.goto('/bills/photo');
  await hydrated(page);
  // The two doors are real file inputs: the camera one asks the OS for the camera app.
  await expect(page.locator('input[data-guide="camera"]')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('input[data-guide="gallery"]')).toHaveAttribute('accept', 'image/*');
  await page
    .locator('input[data-guide="gallery"]')
    .setInputFiles({ name: 'kaccha.png', mimeType: 'image/png', buffer: PNG });
  await expect(page).toHaveURL(/state=reading/);
  await expect(page).toHaveURL(/state=review/, { timeout: 15_000 });
  const src = await page.locator('img[data-guide="photo"]').getAttribute('src');
  expect(src).toMatch(/^data:image\/jpeg;base64,/);
});

test('photo bill: a file over 10 MB is refused with the words, nothing is read', async ({ page }) => {
  await page.goto('/bills/photo');
  await hydrated(page);
  await page.locator('input[data-guide="gallery"]').setInputFiles({
    name: 'huge.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByText(/huge\.jpg badi hai/)).toBeVisible();
  await expect(page).toHaveURL(/\/bills\/photo$/);
});

test('import: the chosen files (PDF, Excel, photo) are the ones the reading names', async ({ page }) => {
  await page.goto('/customers/import');
  await hydrated(page);
  const door = page.locator('input[data-guide="files"]');
  await expect(door).toHaveAttribute('multiple', '');
  await door.setInputFiles([
    { name: 'purane-bills-2025.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    {
      name: 'grahak.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('PK'),
    },
    { name: 'IMG_1.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await expect(page).toHaveURL(/state=reading/);
  await expect(page).toHaveURL(/state=rows/, { timeout: 15_000 });
  await expect(page.getByText('purane-bills-2025.pdf · grahak.xlsx · IMG_1.png')).toBeVisible();
});

test('aap: the logo comes from the files folder and shows on the row', async ({ page }) => {
  // Stage 4: the logo is the owner's to set, so the journey runs as the owner of Sharma Electricals.
  await page.goto('/dev/switch/sharma?to=/aap');
  await hydrated(page);
  await page.locator('input.eb-filedoor').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.locator('[data-guide="logo"] img.eb-logo-preview')).toHaveAttribute('src', /^data:image\/jpeg/);
});

test('@desktop photo bill: a laptop uses the live camera, with the browser’s own permission', async ({ page }) => {
  await page.goto('/bills/photo');
  await hydrated(page);
  await page.getByRole('radio', { name: 'Photo lo' }).click();
  await expect(page.locator('[data-guide="camera-live"]')).toBeVisible();
  await expect(page.locator('video.eb-camera__video')).toBeVisible();
  await page.getByRole('button', { name: 'Kheencho' }).click();
  await expect(page).toHaveURL(/state=reading/);
  await expect(page).toHaveURL(/state=review/, { timeout: 15_000 });
  const src = await page.locator('img[data-guide="photo"]').getAttribute('src');
  expect(src).toMatch(/^data:image\/jpeg;base64,/);
});

// Stage 11 review: the proxy buffers at most 40 MB of a body and cut the rest, so a big import always failed as
// "form.invalid". The screen refuses more than 36 MB before sending; the route refuses it unread.
test('import: more than 36 MB at once is refused in words, before and at the door', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/customers/import');
  await hydrated(page);
  const eight = (i: number) => ({
    name: `scan-${i}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(8 * 1024 * 1024, 0x20),
  });
  await page.locator('input[data-guide="files"]').setInputFiles([1, 2, 3, 4, 5].map(eight));
  await expect(page.locator('main')).toContainText('36 MB tak');
  await expect(page).not.toHaveURL(/state=reading/);
  const res = await page.request.post('/api/imports', {
    multipart: { files: { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(38 * 1024 * 1024) } },
  });
  expect(res.status()).toBe(413);
  expect(await res.json()).toEqual({ error: 'import.error.too-big-total' });
});
