import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT = join(__dirname, '..', '..');
const THEMES = ['narangi', 'harmony'] as const;

/**
 * The UI kit in both themes at 390px: the stored baseline is the regression
 * gate (threshold 0.1, max 0.5 % differing pixels). The difference against the
 * design pack's own 00-kit.png is measured and reported, never gated: the
 * pack's page and the kit page are not the same page.
 */
for (const theme of THEMES) {
  test(`kit renders in ${theme}`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'eb-theme', value: theme, url: baseURL ?? 'http://127.0.0.1:3000' }]);
    await page.goto('/kit');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId('kit-tour')).toBeVisible();
    // Every component on the page from tokens; no literal colour reaches the DOM styles.
    const inline = await page.locator('[style*="#"]').count();
    expect(inline).toBe(0);
    await expect(page).toHaveScreenshot(`kit-${theme}.png`, { fullPage: true, animations: 'disabled' });

    const reference = join(ROOT, 'design', 'screens', theme, '00-kit.png');
    if (!existsSync(reference)) return;
    const actual = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }));
    const ref = PNG.sync.read(readFileSync(reference));
    // The pack's sheet is wider than a phone (2480 px); scale it to the kit's width by
    // nearest sampling, then compare the overlapping height. A number for the eye, not a gate.
    const width = actual.width;
    const scale = ref.width / actual.width;
    const scaledHeight = Math.floor(ref.height / scale);
    const height = Math.min(actual.height, scaledHeight);
    const crop = (png: PNG, sx: number) => {
      const out = new PNG({ width, height });
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const srcX = Math.min(png.width - 1, Math.floor(x * sx));
          const srcY = Math.min(png.height - 1, Math.floor(y * sx));
          const si = (srcY * png.width + srcX) * 4;
          const di = (y * width + x) * 4;
          out.data[di] = png.data[si] ?? 0;
          out.data[di + 1] = png.data[si + 1] ?? 0;
          out.data[di + 2] = png.data[si + 2] ?? 0;
          out.data[di + 3] = png.data[si + 3] ?? 255;
        }
      }
      return out;
    };
    const diff = new PNG({ width, height });
    const differing = pixelmatch(crop(actual, 1).data, crop(ref, scale).data, diff.data, width, height, {
      threshold: 0.1,
    });
    const ratio = differing / (width * height);
    const outDir = join(ROOT, '.watch', 'kit-diff');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `kit-${theme}-vs-pack.png`), PNG.sync.write(diff));
    writeFileSync(
      join(outDir, `kit-${theme}.json`),
      JSON.stringify(
        {
          theme,
          actual: [actual.width, actual.height],
          reference: [ref.width, ref.height],
          compared: [width, height],
          differing,
          ratio,
        },
        null,
        2,
      ),
    );
    test.info().annotations.push({
      type: 'pack-difference',
      description: `${theme}: ${(ratio * 100).toFixed(1)} % of ${width}×${height} px differ from design/screens/${theme}/00-kit.png`,
    });
    console.log(
      `kit ${theme}: ${(ratio * 100).toFixed(1)} % differs from the pack reference (${width}×${height} compared; reported, not gated)`,
    );
  });
}

for (const theme of THEMES) {
  test(`shell at desktop width in ${theme} @desktop`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'eb-theme', value: theme, url: baseURL ?? 'http://127.0.0.1:3000' }]);
    await page.goto('/kit');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByTestId('kit-tour')).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    await expect(page).toHaveScreenshot(`kit-desktop-${theme}.png`, { fullPage: false, animations: 'disabled' });
  });
}
