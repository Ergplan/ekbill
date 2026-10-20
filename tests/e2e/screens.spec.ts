import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import { SAMPLE_URL, SCREENS, STATE_URLS } from '../../apps/web/screens/registry';

const ROOT = join(__dirname, '..', '..');
const THEMES = ['narangi', 'harmony'] as const;
const ROLE_AS: Record<string, string> = { owner: 'owner', staff: 'staff', accountant: 'accountant' };

/**
 * Every screen in both themes at 390px (I10): the stored baseline is the
 * regression gate for later stages; the PNG is also copied into
 * design/screens/<theme>/v2-<id>.png as the reference /flow shows. For the
 * screens the pack drew, the pixel difference against its PNG is reported.
 */
async function open(page: Page, url: string, theme: string, as?: string) {
  const u = as ? `${url}${url.includes('?') ? '&' : '?'}as=${as}` : url;
  await page.context().addCookies([{ name: 'eb-theme', value: theme, url: 'http://127.0.0.1:3000' }]);
  await page.goto(u);
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const theme of THEMES) {
  for (const s of SCREENS) {
    test(`${s.id} renders in ${theme} with its guide ids, taps and one primary`, async ({ page }, info) => {
      await open(page, SAMPLE_URL[s.id]!, theme);
      // Manifest completeness: every declared guide id is in the DOM (states that hide one are listed in STATE_URLS).
      const present = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-guide]')).map((e) => e.getAttribute('data-guide')),
      );
      const missing = s.guides.filter((g) => !present.includes(g) && !s.optionalGuides?.includes(g));
      expect(missing, `${s.id}: guide ids not in the DOM`).toEqual([]);
      // Every tap label is on the screen as a button, link or chip (or lives in a sheet that opens on a tap).
      // What the owner can read or a screen reader can announce: the text plus the aria-labels of icon-only buttons.
      const text = await page.evaluate(() => {
        const main = document.querySelector('main');
        const labels = Array.from(main?.querySelectorAll('[aria-label]') ?? []).map((e) =>
          e.getAttribute('aria-label'),
        );
        return `${main?.innerText ?? ''} ${labels.join(' ')}`.replace(/\s+/g, ' ');
      });
      for (const tap of [...(s.primary ? [s.primary] : []), ...s.taps]) {
        if (SHEET_LABELS[s.id]?.includes(tap.label)) continue;
        expect(text, `${s.id}: "${tap.label}" not on screen`).toContain(tap.label.replace(/\s+/g, ' '));
      }
      // One primary per screen state (I9): at most one PrimaryCTA/WhatsAppButton anywhere in the DOM.
      const primaries = await page.locator('[data-primary="true"]').count();
      expect(primaries, `${s.id}: primary buttons`).toBeLessThanOrEqual(1);
      // Nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

      await expect(page).toHaveScreenshot(`${s.id}-${theme}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
      const snapshot = info.snapshotPath(`${s.id}-${theme}.png`);
      if (existsSync(snapshot)) {
        const refDir = join(ROOT, 'design', 'screens', theme);
        mkdirSync(refDir, { recursive: true });
        copyFileSync(snapshot, join(refDir, `v2-${s.id}.png`));
      }
      const ref = s.reference?.[theme];
      if (ref)
        await reportPackDifference(page, s.id, theme, join(ROOT, 'design', 'screens', theme, `${ref}.png`), info);
    });
  }
  for (const st of STATE_URLS) {
    test(`${st.screen} state ${st.state} renders in ${theme}`, async ({ page }) => {
      await open(page, st.url, theme, st.as);
      expect(await page.locator('[data-primary="true"]').count()).toBeLessThanOrEqual(1);
      await expect(page).toHaveScreenshot(`${st.screen}--${st.state}-${theme}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
}

for (const theme of THEMES) {
  test(`the /flow review screen renders in ${theme}`, async ({ page }) => {
    await open(page, '/flow', theme);
    await expect(page.getByRole('radio', { name: /Screens \(/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page).toHaveScreenshot(`flow-${theme}.png`, { fullPage: false, animations: 'disabled' });
  });
}

test('the /flow review screen at desktop width @desktop', async ({ page }) => {
  await open(page, '/flow', 'narangi');
  await expect(page.getByRole('radio', { name: /Golden paths/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test('role-hidden elements are absent for that role (8.3)', async ({ page }) => {
  for (const s of SCREENS) {
    for (const [role, ids] of Object.entries(s.hidden ?? {})) {
      const url = SAMPLE_URL[s.id]!;
      const res = await page.goto(`${url}${url.includes('?') ? '&' : '?'}as=${ROLE_AS[role]}`);
      if (!res || res.url().includes('as=') === false) continue; // redirected away: the screen itself is not reachable for the role
      for (const id of ids) {
        expect(await page.locator(`[data-guide="${id}"]`).count(), `${s.id} as ${role}: ${id} must be hidden`).toBe(0);
      }
    }
  }
});

test('the tour lights up each guide id in turn (rule 17)', async ({ page }) => {
  await open(page, '/', 'narangi');
  await page.getByTestId('tour').click();
  await expect(page.locator('.eb-guide__ring')).toBeVisible();
  // The two opening buttons first (20 Oct: pakka, then kaccha), then the three questions.
  await expect(page.locator('.eb-guide__caption')).toContainText('Pakka bill');
  await page.locator('.eb-guide__next').click();
  await expect(page.locator('.eb-guide__caption')).toContainText('Kaccha bill yaani estimate');
  await page.locator('.eb-guide__next').click();
  await expect(page.locator('.eb-guide__caption')).toContainText('Kiska bill');
  await page.locator('.eb-guide__next').click();
  await expect(page.locator('.eb-guide__caption')).toContainText('Haath se likha bill');
});

/** Tap labels that live inside a sheet or another state, so they are not in the default DOM text. */
const SHEET_LABELS: Record<string, string[]> = {
  'bill-view': ['Poore', 'Kuch hissa', 'Cancel karke naya banao', 'Rakam kam karo'],
  bill: ['Chuno', 'Naya likho'],
  home: ['Pehla bill banao', 'Apne baare mein batao', 'Naam dhoondo', 'GST'],
  setup: ['Abhi nahi', 'Abhi bhar deta hoon', 'Badlo', 'Chalo, shuru karte hain'],
  login: ['Aage'],
  // Paying shows only once the operator takes payments, for the owner (20 Oct); the sample is a look.
  plan: ['UPI se ₹20 do', 'Payment ho gaya'],
  photo: ['Photo lo', 'Gallery se', 'Dobara lo', 'Naya bill likho'],
  import: ['Files chuno', 'N customers add karo'],
  team: ['Bhejo'],
  ask: ['Poocho'],
  help: ['Is hisaab se bill banao'],
  'bill-done': [],
  customer: [],
  gst: ['INV-042'],
  aap: ['Bill number series', 'Save karo'], // Save floats only while something is unsaved (19 Oct)
  dues: [],
};

async function reportPackDifference(
  page: Page,
  id: string,
  theme: string,
  refPath: string,
  info: ReturnType<typeof test.info>,
) {
  if (!existsSync(refPath)) return;
  const buf = await page.screenshot({ fullPage: true, animations: 'disabled' });
  const actual = PNG.sync.read(buf);
  const ref = PNG.sync.read(readFileSync(refPath));
  const width = Math.min(actual.width, ref.width);
  const height = Math.min(actual.height, ref.height);
  const crop = (png: PNG) => {
    const out = new PNG({ width, height });
    PNG.bitblt(png, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const diff = new PNG({ width, height });
  const differing = pixelmatch(crop(actual).data, crop(ref).data, diff.data, width, height, { threshold: 0.1 });
  const ratio = differing / (width * height);
  const outDir = join(ROOT, '.watch', 'pack-diff');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${id}-${theme}.png`), PNG.sync.write(diff));
  writeFileSync(
    join(outDir, `${id}-${theme}.json`),
    JSON.stringify(
      {
        id,
        theme,
        reference: refPath,
        actual: [actual.width, actual.height],
        referenceSize: [ref.width, ref.height],
        compared: [width, height],
        differing,
        ratio,
      },
      null,
      2,
    ),
  );
  info.annotations.push({
    type: 'pack-difference',
    description: `${id} ${theme}: ${(ratio * 100).toFixed(1)} % of ${width}×${height} differs from the pack`,
  });
}
