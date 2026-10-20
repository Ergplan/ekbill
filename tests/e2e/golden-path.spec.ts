import { expect, test, type Page } from '@playwright/test';

import pg from 'pg';

import { goldenPaths } from '../../apps/web/screens/golden-paths';

/**
 * The golden paths (I9), walked on the prototype and counted: every click
 * and every field fill below is one tap, and the number must equal the
 * sequence in apps/web/screens/golden-paths.ts, which must be within budget.
 */
const budget = (id: string) => goldenPaths.find((p) => p.id === id)!;

async function tap(page: Page, counter: { n: number }, action: () => Promise<void>) {
  await hydrated(page);
  counter.n += 1;
  await action();
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'eb-theme', value: 'narangi', url: 'http://127.0.0.1:3000' }]);
});

/** A tap lands only on a hydrated page; the dev server compiles a screen on its first visit. */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}

/** The hand-off is the last step of (a) and (d): a stub Web Share and window.open record it, so the walk is measured up to it. */
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    // A phone that can share files: a real bill (a session, Stage 6) goes as its PDF.
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: unknown) => {
        (window as unknown as { __shared: unknown[] }).__shared.push(data);
        return Promise.resolve();
      },
    });
    // A customer whose number is known (20 Oct): their chat opens straight away (wa.me), with the bill's link.
    window.open = ((url?: string | URL) => {
      const u = String(url);
      (window as unknown as { __shared: unknown[] }).__shared.push({
        url: u,
        text: decodeURIComponent(u.split('?text=')[1] ?? ''),
      });
      return { opener: null } as unknown as Window;
    }) as typeof window.open;
  });
}

/** Playwright's "Slow 3G / 4× CPU" profile through the Chrome DevTools protocol (I9: path (a) within 20 s). */
async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (500 * 1024) / 8,
    uploadThroughput: (500 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}

test('(a) repeat bill to a regular customer, sent on WhatsApp: 4 taps, within 20 s on Slow 3G / 4× CPU', async ({
  page,
}) => {
  const c = { n: 0 };
  await stubShare(page);
  // The throttled timing is meaningful against a production build (CI sets E2E_PROD=1 and runs `next start`);
  // on the dev server the first visit compiles each screen, so the dev run warms them once and is not timed.
  const timed = process.env.E2E_PROD === '1';
  if (!timed) {
    for (const path of ['/bills/new?customer=mehta&as=owner', '/bills/new/done?as=owner']) {
      await page.goto(path);
      await hydrated(page);
    }
  }
  // The sample shop, as a look (20 Oct: signed out is the welcome).
  await page.goto('/?as=owner');
  await hydrated(page);
  const cdp = timed ? await throttle(page) : null;
  const started = Date.now();
  await tap(page, c, () => page.getByRole('link', { name: 'Mehta Traders' }).click());
  await expect(page).toHaveURL(/\/bills\/new\?customer=mehta/);
  await tap(page, c, () => page.getByRole('button', { name: 'Haan, wahi bharo' }).click());
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done/);
  await expect(page.locator('.eb-paper')).toContainText('Mehta Traders');
  await tap(page, c, () => page.getByRole('button', { name: 'WhatsApp pe bhejo' }).click());
  await page.waitForFunction(() => (window as unknown as { __shared: unknown[] }).__shared.length === 1);
  const elapsed = (Date.now() - started) / 1000;
  await expect(page.getByRole('button', { name: /WhatsApp pe gaya/ })).toBeVisible();
  const shared = (await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared))[0] as {
    text: string;
  };
  expect(shared.text).toContain('Mehta');
  if (cdp) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
  }
  console.log(
    `path (a): ${c.n} taps in ${elapsed.toFixed(1)} s${timed ? ' on Slow 3G / 4× CPU' : ' (untimed: dev server)'}`,
  );
  expect(c.n).toBe(budget('a').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('a').budget);
  if (timed) expect(elapsed).toBeLessThanOrEqual(20);
});

test('(b) money came in, in full: 3 taps', async ({ page }) => {
  const c = { n: 0 };
  // The sample shop, as a look (20 Oct: signed out is the welcome).
  await page.goto('/?as=owner');
  await hydrated(page);
  await tap(page, c, () => page.locator('.eb-owedrow').first().getByRole('link').click());
  await expect(page).toHaveURL(/\/bills\/INV-/);
  await tap(page, c, () => page.getByRole('button', { name: 'Paise aa gaye' }).click());
  await expect(page.getByRole('dialog')).toBeVisible();
  await tap(page, c, () => page.getByRole('radio', { name: /Poore/ }).click());
  await expect(page.locator('main')).toContainText('Likh liya');
  expect(c.n).toBe(budget('b').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('b').budget);
});

test('(c) bill from a photo: 3 taps plus the picker', async ({ page }) => {
  const c = { n: 0 };
  // The sample shop, as a look (20 Oct: signed out is the welcome).
  await page.goto('/?as=owner');
  await hydrated(page);
  await tap(page, c, () => page.getByRole('link', { name: 'Photo se bill' }).click());
  await expect(page).toHaveURL(/\/bills\/photo/);
  // "Photo lo" opens the real file picker; the chosen photo starts the reading (the picker itself is not a tap).
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    tap(page, c, () => page.getByRole('radio', { name: 'Photo lo' }).click()),
  ]);
  await chooser.setFiles({ name: 'kaccha.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not-really-a-jpeg') });
  await expect(page).toHaveURL(/state=review/, { timeout: 10_000 });
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done/);
  await expect(page.locator('.eb-paper')).toContainText('Fan repair');
  expect(c.n).toBe(budget('c').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('c').budget);
});

test('(d) brand-new owner from welcome to the first bill on WhatsApp: 16 taps', async ({ page }) => {
  const c = { n: 0 };
  await stubShare(page);
  // A first-timer has not seen the demo (the seed marks its people as having seen it).
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev',
  });
  await db.connect();
  await db.query("update users set demo_seen_version = 0 where phone_e164 = '+919822000005'");
  await db.end();
  await page.goto('/dev/switch/new');
  await expect(page).toHaveURL(/\/welcome/);
  await hydrated(page);
  await tap(page, c, () => page.getByRole('button', { name: 'Shuru karein' }).click());
  await tap(page, c, () => page.getByLabel('Phone number').fill('9822000005'));
  await tap(page, c, () => page.getByRole('button', { name: 'Aage', exact: true }).click());
  // With SMS off (the build) the number signs in at once: the code step (one tap with OTP on) is not there.
  c.n += 1;
  // Home greets a first-timer (20 Oct): no tour this time, then "Apne baare mein batao".
  await expect(page.getByTestId('demo-dialog')).toBeVisible({ timeout: 15_000 });
  await tap(page, c, () => page.getByTestId('demo-no').click());
  await tap(page, c, () => page.locator('.eb-star [data-primary="true"]').click());
  await expect(page).toHaveURL(/\/setup\/name/);
  await tap(page, c, () => page.getByLabel(/dukaan ka naam/i).fill('Naya Electricals'));
  await tap(page, c, () => page.getByRole('button', { name: 'Aage' }).click());
  await expect(page).toHaveURL(/\/setup\/gst/);
  await tap(page, c, () => page.getByRole('radio', { name: 'Nahi', exact: true }).click());
  await expect(page).toHaveURL(/\/setup\/review/);
  await tap(page, c, () => page.getByRole('button', { name: 'Chalo, shuru karte hain' }).click());
  await expect(page).toHaveURL(/\/$/);
  await tap(page, c, () => page.getByRole('button', { name: 'Pehla bill banao' }).click());
  await expect(page).toHaveURL(/\/bills\/new\?first=1/);
  await tap(page, c, () => page.getByLabel('Customer ka naam').fill('Pehla Customer'));
  await tap(page, c, () => page.getByLabel('Kya kiya?').fill('Fan install'));
  await tap(page, c, () => page.getByLabel('Rate (₹)').fill('1350'));
  await tap(page, c, () => page.getByRole('button', { name: /Bill banao/ }).click());
  await expect(page).toHaveURL(/\/bills\/new\/done/);
  await expect(page.locator('.eb-paper')).toContainText('Pehla Customer');
  await tap(page, c, () => page.getByRole('button', { name: 'WhatsApp pe bhejo' }).click());
  await page.waitForFunction(() => (window as unknown as { __shared: unknown[] }).__shared.length === 1);
  expect(c.n).toBe(budget('d').taps.length);
  expect(c.n).toBeLessThanOrEqual(budget('d').budget);
});
