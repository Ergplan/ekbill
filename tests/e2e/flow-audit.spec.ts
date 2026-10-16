import { expect, test, type Page } from '@playwright/test';

import { SAMPLE_URL } from '../../apps/web/screens/registry';

/**
 * The flow audit (Stage 9; the MVP's scripts/e2e-flow.mjs, ported): every
 * screen as the owner, staff, the accountant, the composition business and
 * the signed-out demo, in both themes, on real data. On each screen: no
 * sideways scroll; a way out (the back arrow or the tabs) that leads
 * somewhere else; tap targets at least 44 px; no junk text ("undefined",
 * "NaN", "[object"); no broken picture; no English-only buttons left in a
 * Hinglish screen.
 */
const PERSONAS = [
  { key: 'sharma', as: 'owner' },
  { key: 'ravi', as: 'staff' },
  { key: 'meera', as: 'accountant' },
  // The composition business's own bill, customer and item stand in for the regular one's.
  { key: 'gupta', as: 'composition owner', ids: { 'INV-042': 'BOS-021', mehta: 'tiffin', amc: 'rice' } },
  { key: null, as: 'signed-out demo' },
] as const;
const THEMES = ['narangi', 'harmony'] as const;
// The screens a member of a business visits (welcome, login, setup and the switcher are the door, audited for the new owner).
const SCREENS = Object.entries(SAMPLE_URL).filter(([id]) => !['welcome', 'login', 'setup', 'switch'].includes(id));

/** The theme the layout reads before paint (the switcher set the person's own; this replaces it). */
async function setThemeCookie(page: Page, theme: string) {
  await page.evaluate((t) => {
    document.cookie = `eb-theme=${t}; path=/; max-age=31536000; samesite=lax`;
  }, theme);
}

async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}

async function audit(page: Page): Promise<string[]> {
  const location = new URL(page.url());
  const r = await page.evaluate(() => {
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      return (
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        b.width > 0 &&
        b.height > 0 &&
        !el.closest('details:not([open]) > :not(summary)') &&
        !el.closest('[aria-hidden="true"]')
      );
    };
    const label = (el: Element) =>
      (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const small = [
      ...document.querySelectorAll(
        'main button, main a.eb-btn, main input:not([type=checkbox]):not([type=file]):not([type=radio]):not([type=hidden]), main select, main summary',
      ),
    ]
      .filter(visible)
      // A field inside a pill (the search) is tapped anywhere on the pill.
      .map((el) => ({ el, box: (el.closest('label.eb-search') ?? el).getBoundingClientRect() }))
      .filter(({ box }) => box.height < 44)
      .map(({ el, box }) => `${label(el)} (${Math.round(box.height)}px)`);
    const text = document.querySelector('main')?.innerText ?? document.body.innerText;
    const hindi = document.documentElement.lang !== 'en';
    const english = hindi
      ? [...document.querySelectorAll('main button:not([role="radio"]), main a.eb-btn')]
          .filter(visible)
          .map((el) => el.textContent?.trim() ?? '')
          .filter((t) => /^(Save|Submit|Cancel|Delete|Settings|Issue|Continue|Next|Back|OK|Close)$/i.test(t))
      : [];
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      hasBack: Boolean(document.querySelector('[data-guide="back"], [data-guide="home"]')),
      hasTabs: [...document.querySelectorAll('nav')].some(visible),
      small,
      junk: /\bundefined\b|\bNaN\b|\[object /.test(text)
        ? (text.match(/.{0,30}(undefined|NaN|\[object ).{0,30}/)?.[0] ?? 'junk')
        : null,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && visible(i)).length,
      english,
    };
  });
  const problems: string[] = [];
  if (r.overflow > 1) problems.push(`scrolls sideways by ${r.overflow}px`);
  // The welcome screen is where the app starts: there is nowhere to go back to (the MVP's audit spared /start too).
  if (!r.hasBack && !r.hasTabs && !location.pathname.startsWith('/welcome'))
    problems.push('no way out: no back arrow, no tabs, no way home');
  if (r.small.length) problems.push(`small tap targets: ${r.small.slice(0, 4).join(', ')}`);
  if (r.junk) problems.push(`junk text: "${r.junk}"`);
  if (r.broken) problems.push(`${r.broken} broken picture(s)`);
  if (r.english.length) problems.push(`English-only buttons: ${r.english.join(', ')}`);
  return problems;
}

for (const persona of PERSONAS)
  for (const theme of THEMES)
    test(`flow audit: every screen as the ${persona.as}, ${theme}`, async ({ page }) => {
      test.setTimeout(240_000);
      if (persona.key) await page.goto(`/dev/switch/${persona.key}?to=/`);
      else await page.goto('/');
      await setThemeCookie(page, theme);
      const problems: string[] = [];
      const ids: Record<string, string> = 'ids' in persona ? persona.ids : {};
      for (const [id, sample] of SCREENS) {
        const url = Object.entries(ids).reduce((u, [from, to]) => u.replace(from, to), sample);
        await page.goto(url);
        await hydrated(page);
        const shown = await page.locator('html').getAttribute('data-theme');
        if (shown !== theme) problems.push(`${id} (${page.url()}): theme "${shown}", not ${theme}`);
        const here = new URL(page.url());
        for (const p of await audit(page)) problems.push(`${id} (${here.pathname}${here.search}): ${p}`);
        // Out by the back arrow: it leads somewhere else (in the first theme; the second checks the same buttons).
        if (theme === 'narangi' && (await page.locator('[data-guide="back"]').count())) {
          await page.locator('[data-guide="back"]').first().click();
          await page
            .waitForURL((u) => `${u.pathname}${u.search}` !== `${here.pathname}${here.search}`, { timeout: 15_000 })
            .catch(() => {
              problems.push(`${id}: the back arrow went nowhere`);
            });
        }
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });

test('flow audit: the brand-new owner, from welcome into setup, both themes', async ({ page }) => {
  for (const theme of THEMES) {
    await page.goto('/dev/switch/new');
    await setThemeCookie(page, theme);
    const problems: string[] = [];
    for (const url of ['/welcome', '/setup/name', '/setup/gst']) {
      await page.goto(url);
      await hydrated(page);
      for (const p of await audit(page)) problems.push(`${url}: ${p}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  }
});

test('flow audit: a link to nothing says so, in the theme, with the way home', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/');
  await setThemeCookie(page, 'harmony');
  await page.goto('/bills/NO-SUCH-BILL');
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'harmony');
  await expect(page.locator('main')).toContainText('Yeh mila nahi');
  expect(await audit(page)).toEqual([]);
  await page.getByRole('link', { name: 'Ghar' }).click();
  await expect(page).toHaveURL(/\/$/);
});
